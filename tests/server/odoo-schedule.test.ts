import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { startFakeOdoo, type FakeOdooEmployee } from '../helpers/fake-odoo';
import { odooSettings, odooSyncRuns, users, type User } from '@/db/schema';
import { saveOdooSettings } from '@/server/odoo/settings';
import { listSyncRuns, runScheduledSyncIfDue } from '@/server/odoo/sync';

const KEY = 'api-key-xyz';
const emp = (id: number, email: string): FakeOdooEmployee => ({
  id, name: `E${id}`, work_email: email, parent_id: false, job_title: false, job_id: false, active: true,
});

let fake: Awaited<ReturnType<typeof startFakeOdoo>>;
let admin: User;
const NOW = new Date('2026-11-22T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const runs = () => testDb.select().from(odooSyncRuns);

beforeEach(async () => {
  fake = await startFakeOdoo({ db: 'db', login: 'me', apiKey: KEY, employees: [emp(1, 'a@x.com')] });
  admin = await makeUser({ isAdmin: true });
  await saveOdooSettings(testDb, admin, { url: fake.url, database: 'db', login: 'me', apiKey: KEY, mode: 'incremental', scheduleHours: 6 });
});
afterEach(async () => { await fake.close(); });

describe('runScheduledSyncIfDue', () => {
  it('no prior run → runs an incremental sync with trigger schedule', async () => {
    await runScheduledSyncIfDue(testDb, NOW);
    const r = await runs();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mode: 'incremental', trigger: 'schedule', status: 'applied' });
    expect((await testDb.select().from(users).where(eq(users.email, 'a@x.com'))).length).toBe(1);
  });

  it('not due → no run; due → run', async () => {
    await testDb.insert(odooSyncRuns).values({ mode: 'incremental', trigger: 'schedule', status: 'applied', startedAt: hoursAgo(2) });
    await runScheduledSyncIfDue(testDb, NOW);
    expect(await runs()).toHaveLength(1);
    await testDb.update(odooSyncRuns).set({ startedAt: hoursAgo(7) });
    await runScheduledSyncIfDue(testDb, NOW);
    expect(await runs()).toHaveLength(2);
  });

  it('manual runs do not count toward the schedule', async () => {
    await testDb.insert(odooSyncRuns).values({ mode: 'incremental', trigger: 'manual', status: 'applied', startedAt: hoursAgo(1) });
    await runScheduledSyncIfDue(testDb, NOW);
    expect((await runs()).filter((r) => r.trigger === 'schedule')).toHaveLength(1);
  });

  it('mode review, scheduleHours 0 or unconfigured → no run', async () => {
    await saveOdooSettings(testDb, admin, { mode: 'review' });
    await runScheduledSyncIfDue(testDb, NOW);
    await saveOdooSettings(testDb, admin, { mode: 'incremental', scheduleHours: 0 });
    await runScheduledSyncIfDue(testDb, NOW);
    await testDb.update(odooSettings).set({ scheduleHours: 6, url: null });
    await runScheduledSyncIfDue(testDb, NOW);
    expect(await runs()).toHaveLength(0);
  });

  it('odoo down → run failed, no throw', async () => {
    await fake.close();
    await expect(runScheduledSyncIfDue(testDb, NOW)).resolves.toBeUndefined();
    const r = await runs();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ trigger: 'schedule', status: 'failed' });
  });

  it('sweeps runs stuck in running for over 30 minutes', async () => {
    const [stale] = await testDb.insert(odooSyncRuns).values({ mode: 'full', trigger: 'manual', status: 'running', startedAt: new Date(Date.now() - 31 * 60_000) }).returning();
    const [fresh] = await testDb.insert(odooSyncRuns).values({ mode: 'full', trigger: 'manual', status: 'running', startedAt: new Date(Date.now() - 5 * 60_000) }).returning();
    const list = await listSyncRuns(testDb, admin);
    expect(list.find((r) => r.id === stale.id)).toMatchObject({ status: 'failed', errorKey: 'odooUnreachable' });
    expect(list.find((r) => r.id === fresh.id)?.status).toBe('running');
  });

  it('the scheduler also sweeps stale running runs', async () => {
    await saveOdooSettings(testDb, admin, { mode: 'review' });
    const [stale] = await testDb.insert(odooSyncRuns).values({ mode: 'full', trigger: 'manual', status: 'running', startedAt: new Date(Date.now() - 40 * 60_000) }).returning();
    await runScheduledSyncIfDue(testDb, new Date());
    const [row] = await testDb.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, stale.id));
    expect(row).toMatchObject({ status: 'failed', errorKey: 'odooUnreachable' });
  });
});
