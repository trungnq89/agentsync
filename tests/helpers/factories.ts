import { planVersions, tasks, users, type NewTask, type NewUser, type Task, type User } from '../../src/db/schema';
import { testDb } from './db';

let seq = 0;

export async function makeUser(p: Partial<NewUser> = {}): Promise<User> {
  const n = ++seq;
  const [u] = await testDb
    .insert(users)
    .values({
      username: `user${n}`,
      displayName: `User ${n}`,
      passwordHash: 'x',
      level: 'member',
      ...p,
    })
    .returning();
  return u;
}

export async function makeTask(
  ownerId: string,
  p: Partial<NewTask> & { steps?: string[] } = {},
): Promise<Task> {
  const { steps = ['Bước 1'], ...rest } = p;
  const [t] = await testDb
    .insert(tasks)
    .values({
      ownerId,
      title: 'Việc mẫu',
      mode: 'executive',
      agreedOutcome: 'Kết quả mẫu',
      startDate: '2026-11-23',
      agreedDueDate: '2026-11-30',
      expectedEndDate: '2026-11-30',
      ...rest,
    })
    .returning();
  await testDb.insert(planVersions).values({
    taskId: t.id,
    version: 1,
    kind: 'initial',
    steps: steps.map((title) => ({ title, status: 'todo' as const })),
  });
  return t;
}
