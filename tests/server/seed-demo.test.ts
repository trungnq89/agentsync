import { describe, it, expect } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { tasks, users } from '@/db/schema';
import { testDb } from '../helpers/db';
import { assertDemoDatabase, DEMO_PASSWORD, seedDemo } from '../../scripts/seed-demo';
import { verifyPassword } from '@/server/auth/password';
import { needsAttention, teamOverview } from '@/server/tasks/queries';

describe('assertDemoDatabase', () => {
  it('refuses database names without "demo"', () => {
    expect(() => assertDemoDatabase('postgres://u:p@localhost:5432/agentsync_test')).toThrow(/demo/);
    expect(() => assertDemoDatabase('postgres://u:p@localhost:5432/agentsync')).toThrow(/demo/);
    expect(() => assertDemoDatabase('not a url')).toThrow();
  });
  it('accepts a demo database name', () => {
    expect(() => assertDemoDatabase('postgres://u:p@localhost:5432/agentsync_demo')).not.toThrow();
  });
});

describe('seedDemo', () => {
  it('creates the org and a realistic mix of tasks (en)', async () => {
    const summary = await seedDemo(testDb, { lang: 'en' });
    expect(summary.users).toBe(7);
    const [u] = await testDb.select({ n: count() }).from(users);
    expect(u.n).toBe(7);
    const rows = await testDb.select().from(tasks);
    expect(rows.length).toBe(summary.tasks);
    const statuses = new Set(rows.map((t) => t.status));
    for (const s of ['pending_confirmation', 'changes_requested', 'in_progress', 'awaiting_review', 'done', 'closed']) {
      expect(statuses.has(s as never), s).toBe(true);
    }
    expect(rows.some((t) => t.isPrivate)).toBe(true);
    expect(rows.some((t) => t.mode === 'executive')).toBe(true);
    expect(rows.some((t) => t.mode === 'project')).toBe(true);
    const [admin] = await testDb.select().from(users).where(eq(users.username, 'quan.nguyen'));
    expect(admin.isAdmin).toBe(true);
    expect(admin.level).toBe('director');
    expect(await verifyPassword(admin.passwordHash, DEMO_PASSWORD)).toBe(true);
  });

  it('feeds the manager home: attention items and tiers', async () => {
    await seedDemo(testDb, { lang: 'en' });
    const [linh] = await testDb.select().from(users).where(eq(users.username, 'linh.tran'));
    const kinds = new Set((await needsAttention(testDb, linh)).map((i) => i.kind));
    for (const k of ['pending_confirmation', 'awaiting_review', 'blocked', 'overdue', 'stale']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
    const { tiers } = await teamOverview(testDb, linh);
    expect(tiers.map((t) => t.level)).toEqual(['manager', 'leader', 'member']);
  });

  it('localizes task text by language', async () => {
    await seedDemo(testDb, { lang: 'vi' });
    const titles = (await testDb.select({ title: tasks.title }).from(tasks)).map((t) => t.title);
    expect(titles).toContain('Thêm đăng nhập SSO cho cổng khách hàng');
    const [admin] = await testDb.select().from(users).where(eq(users.username, 'quan.nguyen'));
    expect(admin.locale).toBe('vi');
  });

  it('refuses a database that already has users', async () => {
    await seedDemo(testDb, { lang: 'en' });
    await expect(seedDemo(testDb, { lang: 'en' })).rejects.toThrow(/already has users/);
  });
});
