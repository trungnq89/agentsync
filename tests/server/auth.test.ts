import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { agentTokens, users } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { login, getSessionUser, logout } from '@/server/auth/session';
import { changeMyPassword } from '@/server/account';
import { createAgentToken, authenticateAgentToken, revokeAgentToken } from '@/server/auth/tokens';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

async function userWithPw(pw: string, p: Parameters<typeof makeUser>[0] = {}) {
  return makeUser({ passwordHash: await hashPassword(pw), ...p });
}

describe('password', () => {
  it('hashes with argon2id and verifies', async () => {
    const h = await hashPassword('s3cret-pw');
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, 's3cret-pw')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('login / sessions', () => {
  it('returns user on correct credentials', async () => {
    const u = await userWithPw('pw-12345', { username: 'alice' });
    const r = await login(testDb, 'alice', 'pw-12345');
    expect(r.user.id).toBe(u.id);
    expect((await getSessionUser(testDb, r.sessionId))?.id).toBe(u.id);
  });

  it('rejects wrong password, unknown user, disabled user with the same message', async () => {
    await userWithPw('pw-12345', { username: 'bob' });
    await userWithPw('pw-12345', { username: 'carol', disabledAt: new Date() });
    const errs = [];
    for (const [n, p] of [['bob', 'nope'], ['ghost', 'pw-12345'], ['carol', 'pw-12345']]) {
      const e = await login(testDb, n, p).catch((x) => x);
      expect(e).toMatchObject({ code: 'UNAUTHORIZED' });
      errs.push(e.message);
    }
    expect(new Set(errs).size).toBe(1);
  });

  it('session expires after 14 days and logout removes it', async () => {
    await userWithPw('pw-12345', { username: 'dave' });
    const { sessionId } = await login(testDb, 'dave', 'pw-12345');
    const soon = new Date(Date.now() + 13 * 86400_000);
    const late = new Date(Date.now() + 15 * 86400_000);
    expect(await getSessionUser(testDb, sessionId, soon)).not.toBeNull();
    expect(await getSessionUser(testDb, sessionId, late)).toBeNull();
    await logout(testDb, sessionId);
    expect(await getSessionUser(testDb, sessionId)).toBeNull();
  });

  it('getSessionUser returns null for disabled user or unknown id', async () => {
    const u = await userWithPw('pw-12345', { username: 'erin' });
    const { sessionId } = await login(testDb, 'erin', 'pw-12345');
    await testDb.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.id));
    expect(await getSessionUser(testDb, sessionId)).toBeNull();
    expect(await getSessionUser(testDb, 'nope')).toBeNull();
  });
});

describe('agent tokens', () => {
  it('creates a token whose plaintext is not stored', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'laptop');
    expect(token).toMatch(/^ags_[A-Za-z0-9_-]{43}$/);
    expect(record.tokenHash).not.toBe(token);
    expect(record.prefix).toBe(token.slice(0, 8));
    expect(record.label).toBe('laptop');
  });

  it('authenticates, updates lastUsedAt, rejects bad token', async () => {
    const u = await makeUser();
    const { token } = await createAgentToken(testDb, u.id, 'l');
    const now = new Date('2026-11-21T00:00:00Z');
    expect((await authenticateAgentToken(testDb, token, now)).id).toBe(u.id);
    const [row] = await testDb.select().from(agentTokens).where(eq(agentTokens.userId, u.id));
    expect(row.lastUsedAt?.toISOString()).toBe(now.toISOString());
    await expect(authenticateAgentToken(testDb, 'ags_bogus')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects revoked token', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'l');
    await revokeAgentToken(testDb, u.id, record.id);
    await expect(authenticateAgentToken(testDb, token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects token of disabled user', async () => {
    const u = await makeUser();
    const { token } = await createAgentToken(testDb, u.id, 'l');
    await testDb.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.id));
    await expect(authenticateAgentToken(testDb, token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('only the owner can revoke', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { token, record } = await createAgentToken(testDb, a.id, 'l');
    await expect(revokeAgentToken(testDb, b.id, record.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await authenticateAgentToken(testDb, token)).id).toBe(a.id);
  });
});

describe('email login and forced change', () => {
  it('login with uppercase email and spaces', async () => {
    const u = await userWithPw('pw-12345', { username: 'someone', email: 'ann@x.com' });
    const r = await login(testDb, '  Ann@X.COM ', 'pw-12345');
    expect(r.user.id).toBe(u.id);
  });

  it('login with username still works', async () => {
    const u = await userWithPw('pw-12345', { username: 'erin', email: 'erin@x.com' });
    expect((await login(testDb, 'erin', 'pw-12345')).user.id).toBe(u.id);
  });

  it('wrong password same error for email and username', async () => {
    await userWithPw('pw-12345', { username: 'frank', email: 'frank@x.com' });
    const msgs = [];
    for (const id of ['frank', 'FRANK@x.com', 'nobody@x.com']) {
      const e = await login(testDb, id, 'nope').catch((x) => x);
      expect(e).toMatchObject({ code: 'UNAUTHORIZED', key: 'badLogin' });
      msgs.push(e.message);
    }
    expect(new Set(msgs).size).toBe(1);
  });

  it('token rejected while mustChangePassword; accepted after changeMyPassword', async () => {
    const u = await userWithPw('pw-12345', { username: 'gina', mustChangePassword: true });
    const { token } = await createAgentToken(testDb, u.id, 'l');
    await expect(authenticateAgentToken(testDb, token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await changeMyPassword(testDb, u, 'pw-12345', 'new-password-1');
    expect((await authenticateAgentToken(testDb, token)).id).toBe(u.id);
  });
});
