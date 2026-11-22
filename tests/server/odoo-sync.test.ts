import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { startFakeOdoo, type FakeOdooEmployee } from '../helpers/fake-odoo';
import { odooSyncRuns, pendingCredentials, sessions, users, type User } from '@/db/schema';
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

async function forgedRun(changes: unknown[], mode: 'full' | 'review') {
  const [run] = await testDb.insert(odooSyncRuns).values({
    mode, trigger: 'manual', status: 'previewed', preview: { changes, skipped: [], untouchedLocal: [] },
  }).returning();
  return run;
}
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
    expect(r).toMatchObject({ created: 3, linked: 0, updated: 0, disabled: 0, skipped: 0 });
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
    expect(run.status).toBe('applied');
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
    expect(r.created).toBe(1);
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
    expect(r).toMatchObject({ disabled: 0, skipped: 1 });
    expect((await testDb.select().from(users).where(eq(users.id, admin.id)))[0].disabledAt).toBeNull();
  });

  it('disable: disables linked user missing from Odoo, deletes sessions, detaches active reports', async () => {
    const gone = await makeUser({ source: 'odoo', odooEmployeeId: 77, email: 'gone@x.com' });
    const report = await makeUser({ managerId: gone.id });
    await testDb.insert(sessions).values({ id: 'sess-gone', userId: gone.id, expiresAt: new Date(Date.now() + 1e7) });
    const p = await previewSync(testDb, admin);
    expect(p.changes.some((c) => c.key === `disable:${gone.id}`)).toBe(true);
    await applySync(testDb, admin, p.runId);
    expect((await testDb.select().from(users).where(eq(users.id, gone.id)))[0].disabledAt).not.toBeNull();
    expect(await testDb.select().from(sessions).where(eq(sessions.userId, gone.id))).toEqual([]);
    expect((await testDb.select().from(users).where(eq(users.id, report.id)))[0].managerId).toBeNull();
  });

  it('review: disable alone still detaches reports from the disabled manager', async () => {
    await saveOdooSettings(testDb, admin, { mode: 'review' });
    const gone = await makeUser({ source: 'odoo', odooEmployeeId: 77, email: 'gone@x.com' });
    const report = await makeUser({ managerId: gone.id });
    const p = await previewSync(testDb, admin);
    await applySync(testDb, admin, p.runId, [`disable:${gone.id}`]);
    expect((await testDb.select().from(users).where(eq(users.id, report.id)))[0].managerId).toBeNull();
  });

  it('review: updateManager targeting an unselected create is skipped and counted', async () => {
    const u = await makeUser({ email: 'bob@x.com', displayName: 'Bob' });
    const run = await forgedRun([
      { key: 'create:e3', type: 'create', employeeId: 3, email: 'cy@x.com', displayName: 'Cy', level: 'member', managerRef: null },
      { key: `manager:${u.id}`, type: 'updateManager', userId: u.id, from: null, to: { employeeId: 3 } },
    ], 'review');
    const r = await applySync(testDb, admin, run.id, [`manager:${u.id}`]);
    expect(r).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect((await testDb.select().from(users).where(eq(users.id, u.id)))[0].managerId).toBeNull();
  });

  it('cycle created by partial application is skipped', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const run = await forgedRun([
      { key: `manager:${a.id}`, type: 'updateManager', userId: a.id, from: null, to: { userId: b.id } },
      { key: `manager:${b.id}`, type: 'updateManager', userId: b.id, from: null, to: { userId: a.id } },
    ], 'full');
    const r = await applySync(testDb, admin, run.id);
    expect(r).toMatchObject({ updated: 1, skipped: 1 });
  });

  it('forced mid-transaction failure → run failed odooApplyFailed, no partial writes', async () => {
    const run = await forgedRun([
      { key: 'create:e1', type: 'create', employeeId: 1, email: 'ann@x.com', displayName: 'Ann', level: 'member', managerRef: null },
      { key: 'create:e2', type: 'create', employeeId: 2, email: 'bob@x.com', displayName: 'Bob', level: 'bogus', managerRef: null },
    ], 'full');
    const err = await rejects(applySync(testDb, admin, run.id));
    expect(err).toBeInstanceOf(DomainError);
    expect(err.key).toBe('odooApplyFailed');
    expect(await byEmail('ann@x.com')).toBeUndefined();
    const [row] = await testDb.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, run.id));
    expect(row).toMatchObject({ status: 'failed', errorKey: 'odooApplyFailed' });
  });

  it('email taken between preview and apply → that create skipped, others applied, no throw', async () => {
    const p = await previewSync(testDb, admin);
    await makeUser({ email: 'Bob@x.com', username: 'bobby' });
    const r = await applySync(testDb, admin, p.runId);
    expect(r).toMatchObject({ created: 2, skipped: 1 });
    expect(r.credentials.map((c) => c.email).sort()).toEqual(['ann@x.com', 'cy@x.com']);
    expect((await byEmail('cy@x.com')).managerId).toBeNull(); // manager e2 never created
  });

  it('username clash between preview and apply → create skipped', async () => {
    const p = await previewSync(testDb, admin);
    await makeUser({ username: 'ann@x.com' });
    const r = await applySync(testDb, admin, p.runId);
    expect(r).toMatchObject({ created: 2, skipped: 1 });
    expect(await byEmail('ann@x.com')).toBeUndefined();
  });

  it('expired preview (>1h) → odooPreviewExpired', async () => {
    const p = await previewSync(testDb, admin);
    const err = await rejects(applySync(testDb, admin, p.runId, undefined, new Date(Date.now() + 61 * 60 * 1000)));
    expect(err.key).toBe('odooPreviewExpired');
    const ok = await applySync(testDb, admin, p.runId, undefined, new Date(Date.now() + 59 * 60 * 1000));
    expect(ok.created).toBe(3);
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
    expect((await applySync(testDb, admin, p.runId)).created).toBe(3);
  });

  it('incremental creates only new users and stores pending credentials; listPendingCredentials returns then deletes', async () => {
    const existing = await makeUser({ email: 'ann@x.com', displayName: 'Old Ann' });
    const r = await runIncrementalSync(testDb, 'schedule', undefined, undefined);
    expect(r).toMatchObject({ created: 2, linked: 1, skipped: 0 }); // link of existing ann, no rename
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

  it('incremental under odooSyncBusy → run failed with odooSyncBusy', async () => {
    await testDb.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('agentsync_odoo_sync'))`);
      expect((await rejects(runIncrementalSync(testDb, 'manual', admin))).key).toBe('odooSyncBusy');
    });
    const [run] = await listSyncRuns(testDb, admin);
    expect(run).toMatchObject({ status: 'failed', errorKey: 'odooSyncBusy', mode: 'incremental' });
  });

  it('run is recorded as running while Odoo is being fetched', async () => {
    const slow = startFakeOdoo({ db: 'db', login: 'me', apiKey: KEY, employees: EMPS, delayMs: 300 });
    const s2 = await slow;
    await saveOdooSettings(testDb, admin, { url: s2.url });
    const pending = previewSync(testDb, admin);
    await new Promise((r) => setTimeout(r, 100));
    expect((await listSyncRuns(testDb, admin))[0].status).toBe('running');
    await pending;
    expect((await listSyncRuns(testDb, admin))[0].status).toBe('previewed');
    await s2.close();
  });

  it('listPendingCredentials skips and deletes undecryptable rows', async () => {
    await runIncrementalSync(testDb, 'schedule');
    const [run] = await listSyncRuns(testDb, admin);
    await testDb.insert(pendingCredentials).values({ userId: admin.id, runId: run.id, secretEnc: 'v1:garbage' });
    expect(await countPendingCredentials(testDb, admin)).toBe(4);
    const list = await listPendingCredentials(testDb, admin);
    expect(list).toHaveLength(3);
    expect(await countPendingCredentials(testDb, admin)).toBe(0);
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
