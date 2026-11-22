import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { startFakeOdoo, type FakeOdooEmployee } from '../helpers/fake-odoo';
import { odooSyncRuns, pendingCredentials, users, type User } from '@/db/schema';
import { saveOdooSettings } from '@/server/odoo/settings';
import { createOdooClient } from '@/server/odoo/client';
import {
  applySync, countPendingCredentials, listPendingCredentials, listSyncRuns, previewSync, runIncrementalSync,
} from '@/server/odoo/sync';
import { verifyPassword } from '@/server/auth/password';
import { DomainError } from '@/server/errors';

const KEY = 'api-key-xyz';
const e = (id: number, name: string, email: string | false, parent: number | false, title: string | false = false, active = true): FakeOdooEmployee => ({
  id, name, work_email: email, parent_id: parent ? [parent, 'p'] : false, job_title: title, job_id: false, active,
});
const EMPS = [e(1, 'Ann', 'Ann@X.com', false, 'Director'), e(2, 'Bob', 'bob@x.com', 1), e(3, 'Cy', 'cy@x.com', 2)];

let fake: Awaited<ReturnType<typeof startFakeOdoo>>;
let admin: User;
beforeEach(async () => {
  fake = await startFakeOdoo({ db: 'db', login: 'me', apiKey: KEY, employees: EMPS });
  admin = await makeUser({ isAdmin: true });
  await saveOdooSettings(testDb, admin, { url: fake.url, database: 'db', login: 'me', apiKey: KEY, mode: 'full' });
});
afterEach(async () => { await fake.close(); });

async function rejects(p: Promise<unknown>) {
  try { await p; } catch (err) { return err as DomainError; }
  throw new Error('expected rejection');
}
const byEmail = async (email: string) => (await testDb.select().from(users).where(eq(users.email, email)))[0];

describe('odoo sync', () => {
  it('preview stores run and returns changes', async () => {
    const p = await previewSync(testDb, admin);
    expect(p.changes.map((c) => c.key)).toEqual(['create:e1', 'create:e2', 'create:e3']);
    const [run] = await testDb.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, p.runId));
    expect(run.status).toBe('previewed');
    expect(run.mode).toBe('full');
    expect(run.actorId).toBe(admin.id);
    expect((run.preview as { changes: unknown[] }).changes).toHaveLength(3);
    const runs = await listSyncRuns(testDb, admin);
    expect(runs).toHaveLength(1);
  });

  it('apply full creates users with source odoo, mustChangePassword, username=email, manager links incl. created-to-created; returns credentials once', async () => {
    const p = await previewSync(testDb, admin);
    const r = await applySync(testDb, admin, p.runId);
    expect(r).toMatchObject({ applied: 3, skipped: 0 });
    expect(r.credentials.map((c) => c.email).sort()).toEqual(['ann@x.com', 'bob@x.com', 'cy@x.com']);
    const ann = await byEmail('ann@x.com');
    const bob = await byEmail('bob@x.com');
    const cy = await byEmail('cy@x.com');
    expect(ann).toMatchObject({ username: 'ann@x.com', source: 'odoo', mustChangePassword: true, odooEmployeeId: 1, displayName: 'Ann', managerId: null });
    expect(bob.managerId).toBe(ann.id);
    expect(cy.managerId).toBe(bob.id);
    const [run] = await testDb.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, p.runId));
    expect(run.status).toBe('applied');
    expect(run.counts).toMatchObject({ create: 3, skipped: 0 });
    expect((await rejects(applySync(testDb, admin, p.runId))).key).toBe('odooPreviewExpired');
  });

  it('credentials passwords 16 chars from safe alphabet and verify with argon2', async () => {
    const p = await previewSync(testDb, admin);
    const r = await applySync(testDb, admin, p.runId);
    for (const c of r.credentials) {
      expect(c.password).toMatch(/^[^0Oo1lI]{16}$/);
      const u = await byEmail(c.email);
      expect(await verifyPassword(u.passwordHash, c.password)).toBe(true);
    }
  });

  it('review applies only selected keys', async () => {
    await saveOdooSettings(testDb, admin, { mode: 'review' });
    const p = await previewSync(testDb, admin);
    const r = await applySync(testDb, admin, p.runId, ['create:e1']);
    expect(r.applied).toBe(1);
    expect(await byEmail('ann@x.com')).toBeTruthy();
    expect(await byEmail('bob@x.com')).toBeUndefined();
  });

  it('admin not in Odoo stays enabled and admin after full; apply re-check never disables an admin', async () => {
    await testDb.update(users).set({ odooEmployeeId: 99, email: 'admin@x.com' }).where(eq(users.id, admin.id));
    const p = await previewSync(testDb, admin);
    await applySync(testDb, admin, p.runId);
    const [a] = await testDb.select().from(users).where(eq(users.id, admin.id));
    expect(a.disabledAt).toBeNull();
    expect(a.isAdmin).toBe(true);
    // forged/stale preview that asks to disable the admin
    const [run] = await testDb.insert(odooSyncRuns).values({
      mode: 'full', trigger: 'manual', status: 'previewed',
      preview: { changes: [{ key: `disable:${admin.id}`, type: 'disable', userId: admin.id }], skipped: [], untouchedLocal: [] },
    }).returning();
    const r = await applySync(testDb, admin, run.id);
    expect(r).toMatchObject({ applied: 0, skipped: 1 });
    expect((await testDb.select().from(users).where(eq(users.id, admin.id)))[0].disabledAt).toBeNull();
  });

  it('disable clears nothing extra: disables linked user missing from Odoo', async () => {
    const gone = await makeUser({ source: 'odoo', odooEmployeeId: 77, email: 'gone@x.com' });
    const p = await previewSync(testDb, admin);
    expect(p.changes.some((c) => c.key === `disable:${gone.id}`)).toBe(true);
    await applySync(testDb, admin, p.runId);
    expect((await testDb.select().from(users).where(eq(users.id, gone.id)))[0].disabledAt).not.toBeNull();
  });

  it('email taken between preview and apply → that create skipped, others applied, no throw', async () => {
    const p = await previewSync(testDb, admin);
    await makeUser({ email: 'Bob@x.com', username: 'bobby' });
    const r = await applySync(testDb, admin, p.runId);
    expect(r).toMatchObject({ applied: 2, skipped: 1 });
    expect(r.credentials.map((c) => c.email).sort()).toEqual(['ann@x.com', 'cy@x.com']);
    expect((await byEmail('cy@x.com')).managerId).toBeNull(); // manager e2 never created
  });

  it('username clash between preview and apply → create skipped', async () => {
    const p = await previewSync(testDb, admin);
    await makeUser({ username: 'ann@x.com' });
    const r = await applySync(testDb, admin, p.runId);
    expect(r).toMatchObject({ applied: 2, skipped: 1 });
    expect(await byEmail('ann@x.com')).toBeUndefined();
  });

  it('expired preview (>1h) → odooPreviewExpired', async () => {
    const p = await previewSync(testDb, admin);
    const err = await rejects(applySync(testDb, admin, p.runId, undefined, new Date(Date.now() + 61 * 60 * 1000)));
    expect(err.key).toBe('odooPreviewExpired');
    const ok = await applySync(testDb, admin, p.runId, undefined, new Date(Date.now() + 59 * 60 * 1000));
    expect(ok.applied).toBe(3);
  });

  it('odoo auth failure → run failed with errorKey odooAuthFailed', async () => {
    await saveOdooSettings(testDb, admin, { apiKey: 'wrong' });
    const err = await rejects(previewSync(testDb, admin));
    expect(err.key).toBe('odooAuthFailed');
    const [run] = await listSyncRuns(testDb, admin);
    expect(run).toMatchObject({ status: 'failed', errorKey: 'odooAuthFailed' });
  });

  it('clientFactory dep is used', async () => {
    const p = await previewSync(testDb, admin, 'full', {
      clientFactory: (c) => createOdooClient(c),
    });
    expect(p.changes).toHaveLength(3);
  });

  it('concurrent apply → second gets odooSyncBusy', async () => {
    const p = await previewSync(testDb, admin);
    await testDb.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('agentsync_odoo_sync'))`);
      expect((await rejects(applySync(testDb, admin, p.runId))).key).toBe('odooSyncBusy');
    });
    expect((await applySync(testDb, admin, p.runId)).applied).toBe(3);
  });

  it('incremental creates only new users and stores pending credentials; listPendingCredentials returns then deletes', async () => {
    const existing = await makeUser({ email: 'ann@x.com', displayName: 'Old Ann' });
    const r = await runIncrementalSync(testDb, 'schedule', undefined, undefined);
    expect(r).toMatchObject({ applied: 3, skipped: 0 }); // 2 creates + link of the existing ann (no rename)
    const kept = (await testDb.select().from(users).where(eq(users.id, existing.id)))[0];
    expect(kept).toMatchObject({ displayName: 'Old Ann', odooEmployeeId: 1 });
    expect((await byEmail('bob@x.com')).managerId).toBe(existing.id);
    const [run] = await testDb.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, r.runId));
    expect(run).toMatchObject({ trigger: 'schedule', mode: 'incremental', status: 'applied', actorId: null });
    expect(await countPendingCredentials(testDb, admin)).toBe(2);
    const raw = JSON.stringify(await testDb.select().from(pendingCredentials));
    const list = await listPendingCredentials(testDb, admin);
    expect(list.map((c) => c.email).sort()).toEqual(['bob@x.com', 'cy@x.com']);
    for (const c of list) {
      expect(raw).not.toContain(c.password);
      expect(await verifyPassword((await byEmail(c.email)).passwordHash, c.password)).toBe(true);
    }
    expect(await countPendingCredentials(testDb, admin)).toBe(0);
    expect(await listPendingCredentials(testDb, admin)).toEqual([]);
  });

  it('non-admin FORBIDDEN on all', async () => {
    const u = await makeUser();
    const calls = [
      previewSync(testDb, u), applySync(testDb, u, admin.id), runIncrementalSync(testDb, 'manual', u),
      listPendingCredentials(testDb, u), countPendingCredentials(testDb, u), listSyncRuns(testDb, u),
    ];
    for (const c of calls) expect((await rejects(c)).code).toBe('FORBIDDEN');
  });
});
