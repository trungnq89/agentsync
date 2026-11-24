import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { authenticateAgentToken, createAgentToken } from '@/server/auth/tokens';
import { listMyTokens } from '@/server/account';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

const DAY = 86_400_000;
const now = new Date('2026-11-24T10:00:00Z');

describe('createAgentToken', () => {
  it('defaults to member scope and 90 days', async () => {
    const u = await makeUser();
    const { record } = await createAgentToken(testDb, u.id, 'l', undefined, now);
    expect(record.scope).toBe('member');
    expect(record.legacy).toBe(false);
    expect(record.expiresAt.getTime()).toBe(now.getTime() + 90 * DAY);
  });

  it('honours days 30 and 180', async () => {
    const u = await makeUser();
    const a = await createAgentToken(testDb, u.id, 'a', { days: 30 }, now);
    const b = await createAgentToken(testDb, u.id, 'b', { days: 180 }, now);
    expect(a.record.expiresAt.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(b.record.expiresAt.getTime()).toBe(now.getTime() + 180 * DAY);
  });

  it('rejects other lifetimes', async () => {
    const u = await makeUser();
    for (const days of [365, 0, 45, NaN]) {
      await expect(createAgentToken(testDb, u.id, 'x', { days }, now)).rejects.toMatchObject({
        code: 'VALIDATION', key: 'invalidTokenLifetime', params: { field: 'days' },
      });
    }
  });

  it('manager scope needs an active direct report', async () => {
    const lonely = await makeUser();
    await expect(createAgentToken(testDb, lonely.id, 'x', { scope: 'manager' }, now)).rejects.toMatchObject({
      code: 'VALIDATION', key: 'tokenScopeNotAllowed', params: { field: 'scope' },
    });
    const mgr = await makeUser({ level: 'manager' });
    await makeUser({ managerId: mgr.id });
    const ok = await createAgentToken(testDb, mgr.id, 'x', { scope: 'manager' }, now);
    expect(ok.record.scope).toBe('manager');
    // a disabled report does not count
    const mgr2 = await makeUser({ level: 'manager' });
    await makeUser({ managerId: mgr2.id, disabledAt: new Date() });
    await expect(createAgentToken(testDb, mgr2.id, 'x', { scope: 'manager' }, now)).rejects.toMatchObject({
      key: 'tokenScopeNotAllowed',
    });
  });

  it('rejects an unknown scope value', async () => {
    const u = await makeUser();
    await expect(createAgentToken(testDb, u.id, 'x', { scope: 'root' as never }, now)).rejects.toMatchObject({
      key: 'tokenScopeNotAllowed',
    });
  });
});

describe('authenticateAgentToken', () => {
  it('returns user and token info', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'lap', undefined, now);
    const r = await authenticateAgentToken(testDb, token, now);
    expect(r.user.id).toBe(u.id);
    expect(r.token).toEqual({ id: record.id, scope: 'member', expiresAt: record.expiresAt, legacy: false, label: 'lap' });
  });

  it('expiresAt == now is rejected, one second before is accepted', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'x', undefined, now);
    await expect(authenticateAgentToken(testDb, token, record.expiresAt)).rejects.toMatchObject({
      code: 'UNAUTHORIZED', key: 'badToken',
    });
    await expect(authenticateAgentToken(testDb, token, new Date(record.expiresAt.getTime() + 1000)))
      .rejects.toMatchObject({ key: 'badToken' });
    const r = await authenticateAgentToken(testDb, token, new Date(record.expiresAt.getTime() - 1000));
    expect(r.token.scope).toBe('member');
  });
});

describe('listMyTokens', () => {
  it('exposes scope, expiresAt and legacy', async () => {
    const u = await makeUser();
    await createAgentToken(testDb, u.id, 'x', { days: 30 }, now);
    const [t] = await listMyTokens(testDb, u);
    expect(t).toMatchObject({ scope: 'member', legacy: false });
    expect(t.expiresAt.getTime()).toBe(now.getTime() + 30 * DAY);
  });
});

describe('migration backfill', () => {
  it('existing tokens become legacy manager tokens expiring in ~90 days', async () => {
    const dir = path.resolve(__dirname, '../../drizzle');
    const file = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .find((f) => /"agent_tokens" ADD COLUMN "legacy"/.test(readFileSync(path.join(dir, f), 'utf8')));
    expect(file, 'migration adding agent_tokens.legacy').toBeDefined();
    const statements = readFileSync(path.join(dir, file!), 'utf8').split('--> statement-breakpoint');
    const client = await testDb.$client.connect();
    try {
      await client.query('DROP SCHEMA IF EXISTS mig_test CASCADE');
      await client.query('CREATE SCHEMA mig_test');
      await client.query('SET search_path TO mig_test');
      await client.query(`CREATE TABLE agent_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
        label text NOT NULL, token_hash text NOT NULL UNIQUE, prefix text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz, revoked_at timestamptz)`);
      await client.query(`INSERT INTO agent_tokens (user_id, label, token_hash, prefix) VALUES (gen_random_uuid(), 'old', 'h', 'ags_xxxx')`);
      const before = Date.now();
      for (const s of statements) if (s.trim()) await client.query(s);
      const { rows } = await client.query('SELECT scope, legacy, expires_at FROM agent_tokens');
      expect(rows[0].scope).toBe('manager');
      expect(rows[0].legacy).toBe(true);
      const delta = new Date(rows[0].expires_at).getTime() - before;
      expect(Math.abs(delta - 90 * DAY)).toBeLessThan(60_000);
    } finally {
      await client.query('SET search_path TO public');
      await client.query('DROP SCHEMA IF EXISTS mig_test CASCADE');
      client.release();
    }
  });
});
