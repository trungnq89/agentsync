import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { planVersions, users } from '@/db/schema';
import { effectiveConfirmer, setCheckpointConfirmer } from '@/server/tasks/confirm';
import { changePlan, createTask, getCurrentPlan } from '@/server/tasks/service';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

describe('effectiveConfirmer', () => {
  it('uses the owner setting when a manager exists and the task is not private', () => {
    expect(effectiveConfirmer({ isPrivate: false }, { managerId: 'm', checkpointConfirmer: 'manager' })).toBe('manager');
    expect(effectiveConfirmer({ isPrivate: false }, { managerId: 'm', checkpointConfirmer: 'member' })).toBe('member');
  });
  it('private task is always member', () => {
    expect(effectiveConfirmer({ isPrivate: true }, { managerId: 'm', checkpointConfirmer: 'manager' })).toBe('member');
  });
  it('owner without a manager is always member', () => {
    expect(effectiveConfirmer({ isPrivate: false }, { managerId: null, checkpointConfirmer: 'manager' })).toBe('member');
  });
});

describe('setCheckpointConfirmer', () => {
  it('defaults new users to member', async () => {
    const u = await makeUser();
    expect(u.checkpointConfirmer).toBe('member');
  });
  it('direct manager can change it', async () => {
    const manager = await makeUser({ level: 'manager' });
    const member = await makeUser({ managerId: manager.id });
    await setCheckpointConfirmer(testDb, manager, member.id, 'manager');
    const [row] = await testDb.select().from(users).where(eq(users.id, member.id));
    expect(row.checkpointConfirmer).toBe('manager');
  });
  it('admin who is not the direct manager, and the manager of the manager, get NOT_FOUND', async () => {
    const admin = await makeUser({ isAdmin: true });
    const top = await makeUser({ level: 'director' });
    const manager = await makeUser({ level: 'manager', managerId: top.id });
    const member = await makeUser({ managerId: manager.id });
    await expect(setCheckpointConfirmer(testDb, admin, member.id, 'manager')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(setCheckpointConfirmer(testDb, top, member.id, 'manager')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(setCheckpointConfirmer(testDb, member, member.id, 'manager')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(setCheckpointConfirmer(testDb, manager, '00000000-0000-0000-0000-000000000000', 'manager'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('invalid value → VALIDATION invalidConfirmer', async () => {
    const manager = await makeUser({ level: 'manager' });
    const member = await makeUser({ managerId: manager.id });
    await expect(setCheckpointConfirmer(testDb, manager, member.id, 'boss' as never))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'invalidConfirmer' });
  });
  it('setting survives a manager change; new manager can change it, old gets NOT_FOUND', async () => {
    const m1 = await makeUser({ level: 'manager' });
    const m2 = await makeUser({ level: 'manager' });
    const member = await makeUser({ managerId: m1.id });
    await setCheckpointConfirmer(testDb, m1, member.id, 'manager');
    await testDb.update(users).set({ managerId: m2.id }).where(eq(users.id, member.id));
    const [row] = await testDb.select().from(users).where(eq(users.id, member.id));
    expect(row.checkpointConfirmer).toBe('manager');
    await expect(setCheckpointConfirmer(testDb, m1, member.id, 'member')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await setCheckpointConfirmer(testDb, m2, member.id, 'member');
  });
});

describe('changePlan owns step status', () => {
  async function seeded(steps: unknown[]) {
    const member = await makeUser();
    const t = await makeTask(member.id, { status: 'in_progress' });
    await testDb.update(planVersions).set({ steps: steps as never }).where(eq(planVersions.taskId, t.id));
    return { member, t };
  }
  it('agent cannot set done or pending_approval on a todo step', async () => {
    const { member, t } = await seeded([{ title: 'A', status: 'todo' }, { title: 'B', status: 'todo' }]);
    await changePlan(testDb, member, t.id, {
      steps: [{ title: 'A', status: 'done' }, { title: 'B', status: 'pending_approval' }, { title: 'C', status: 'done' }],
    });
    const plan = await getCurrentPlan(testDb, t.id);
    expect(plan.steps).toEqual([
      { title: 'A', status: 'todo' }, { title: 'B', status: 'todo' }, { title: 'C', status: 'todo' },
    ]);
  });
  it('agent can set todo/doing on unconfirmed steps', async () => {
    const { member, t } = await seeded([{ title: 'A', status: 'todo' }]);
    await changePlan(testDb, member, t.id, { steps: [{ title: 'A', status: 'doing' }, { title: 'N', status: 'doing' }] });
    expect((await getCurrentPlan(testDb, t.id)).steps).toEqual([
      { title: 'A', status: 'doing' }, { title: 'N', status: 'doing' },
    ]);
  });
  it('done step keeps its stored state and confirmation when resent as doing/todo', async () => {
    const conf = { confirmedBy: 'member', confirmedById: 'u1', confirmedAt: '2026-11-23T01:00:00.000Z' };
    const { member, t } = await seeded([{ title: 'A', status: 'done', ...conf }]);
    await changePlan(testDb, member, t.id, { steps: [{ title: 'A', status: 'doing' }] });
    expect((await getCurrentPlan(testDb, t.id)).steps).toEqual([{ title: 'A', status: 'done', ...conf }]);
  });
  it('pending_approval step keeps its state when resent', async () => {
    const { member, t } = await seeded([{ title: 'A', status: 'pending_approval' }]);
    await changePlan(testDb, member, t.id, { steps: [{ title: 'A', status: 'todo' }] });
    expect((await getCurrentPlan(testDb, t.id)).steps).toEqual([{ title: 'A', status: 'pending_approval' }]);
  });
  it('renaming a done step makes the new step todo (needs reconfirmation)', async () => {
    const conf = { confirmedBy: 'member', confirmedById: 'u1', confirmedAt: '2026-11-23T01:00:00.000Z' };
    const { member, t } = await seeded([{ title: 'A', status: 'done', ...conf }]);
    await changePlan(testDb, member, t.id, { steps: [{ title: 'A2', status: 'done' }] });
    expect((await getCurrentPlan(testDb, t.id)).steps).toEqual([{ title: 'A2', status: 'todo' }]);
  });
});

describe('duplicate step titles', () => {
  it('changePlan and createTask reject duplicates', async () => {
    const member = await makeUser();
    const t = await makeTask(member.id, { status: 'in_progress' });
    await expect(changePlan(testDb, member, t.id, { steps: [{ title: 'A', status: 'todo' }, { title: 'A', status: 'doing' }] }))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'duplicateStepTitle' });
    await expect(createTask(testDb, member, {
      title: 'x', mode: 'executive', agreedOutcome: 'y', startDate: '2026-11-23', agreedDueDate: '2026-11-30', steps: ['A', 'A'],
    })).rejects.toMatchObject({ code: 'VALIDATION', key: 'duplicateStepTitle' });
  });
});
