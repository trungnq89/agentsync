import 'dotenv/config';
import { eq, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import { seedAdmin } from '../../scripts/seed-admin';
import { createUser } from '../../src/server/org';
import { askQuestion } from '../../src/server/tasks/activity';
import { confirmTask, createTask } from '../../src/server/tasks/service';

const url = process.env.DATABASE_URL_E2E;
if (!url) throw new Error('DATABASE_URL_E2E is not set (see .env.example)');

const tableNames = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => `"${getTableName(t)}"`);

/** Truncate the e2e database and seed app_settings plus one admin. */
export async function resetE2eDb(admin: { username: string; password: string }): Promise<void> {
  const db = createDb(url!);
  try {
    await db.execute(sql.raw(`TRUNCATE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`));
    await db.insert(schema.appSettings).values({ id: 1, staleBusinessDays: 3 });
    await seedAdmin(db, admin.username, admin.password);
  } finally {
    await db.$client.end();
  }
}

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * Seed admin(director) -> manager -> leader, built with the real server functions.
 * Manager has an in-progress task with an open blocker; leader has a public task and a
 * private task that also has an open blocker. All passwords are `user-password-1`.
 */
export async function seedOrg(): Promise<{ directorId: string; managerId: string; leaderId: string }> {
  const db = createDb(url!);
  try {
    const [admin] = await db.select().from(schema.users).where(eq(schema.users.username, 'admin'));
    const mk = (username: string, displayName: string, level: 'manager' | 'leader', managerId: string) =>
      createUser(db, admin, { username, displayName, password: 'user-password-1', level, managerId });
    const manager = await mk('manager1', 'Hà Manager', 'manager', admin.id);
    const leader = await mk('leader1', 'Minh Leader', 'leader', manager.id);

    const input = (title: string, isPrivate = false) => ({
      title, mode: 'executive' as const, agreedOutcome: 'Kết quả', isPrivate,
      startDate: isoDay(-5), agreedDueDate: isoDay(10), steps: ['Bước 1', 'Bước 2'],
    });
    const blockedTask = await createTask(db, manager, input('Đàm phán đối tác X'));
    await confirmTask(db, admin, blockedTask.id);
    await askQuestion(db, manager, blockedTask.id, 'Chờ đối tác trả lời', { isBlocker: true });

    const leaderTask = await createTask(db, leader, input('Việc công khai của leader'));
    await confirmTask(db, manager, leaderTask.id);
    const priv = await createTask(db, leader, input('Việc riêng tư bí mật', true));
    await askQuestion(db, leader, priv.id, 'Vướng riêng tư', { isBlocker: true });
    await createUser(db, admin, { username: 'loner1', displayName: 'Người mới', password: 'user-password-1', level: 'member' });
    return { directorId: admin.id, managerId: manager.id, leaderId: leader.id };
  } finally {
    await db.$client.end();
  }
}
