import { it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { planVersions } from '@/db/schema';
import { testDb } from '../helpers/db';
import { makeUser, makeTask } from '../helpers/factories';

it('creates a user with a manager and a task with plan v1', async () => {
  const boss = await makeUser({ level: 'director' });
  const m = await makeUser({ level: 'manager', managerId: boss.id });
  const t = await makeTask(m.id, { steps: ['A', 'B'] });
  const plans = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
  expect(plans).toHaveLength(1);
  expect(plans[0].steps.map((s) => s.title)).toEqual(['A', 'B']);
});
