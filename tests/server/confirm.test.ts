import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { checkpointReviews, planVersions, users } from '@/db/schema';
import { getPendingFeedback, postUpdate } from '@/server/tasks/activity';
import { effectiveConfirmer, reviewCheckpoint, setCheckpointConfirmer } from '@/server/tasks/confirm';
import { changePlan, createTask, getCurrentPlan, setTaskStatus } from '@/server/tasks/service';
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

const T0 = new Date('2026-11-23T03:00:00Z');
const T1 = new Date('2026-11-23T04:00:00Z');
const upd = (stepsCompleted: string[], extra: { memberConfirmed?: boolean } = {}) =>
  ({ body: 'Đã làm', source: 'auto' as const, stepsCompleted, ...extra });

async function setup(confirmer: 'member' | 'manager', taskP: { isPrivate?: boolean } = {}, steps = ['A', 'B']) {
  const manager = await makeUser({ level: 'manager' });
  const member = await makeUser({ managerId: manager.id, checkpointConfirmer: confirmer });
  const t = await makeTask(member.id, { status: 'in_progress', steps, ...taskP });
  return { manager, member, t };
}
const stepsOf = async (taskId: string) => (await getCurrentPlan(testDb, taskId)).steps;

describe('postUpdate with member confirmer', () => {
  it('missing memberConfirmed → VALIDATION and nothing written', async () => {
    const { member, t } = await setup('member');
    await expect(postUpdate(testDb, member, t.id, upd(['A']), T0))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'checkpointConfirmationRequired' });
    await expect(postUpdate(testDb, member, t.id, upd(['A'], { memberConfirmed: false }), T0))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'checkpointConfirmationRequired' });
    expect(await stepsOf(t.id)).toEqual([{ title: 'A', status: 'todo' }, { title: 'B', status: 'todo' }]);
    const { updates } = await import('@/db/schema');
    expect(await testDb.select().from(updates).where(eq(updates.taskId, t.id))).toHaveLength(0);
  });
  it('with memberConfirmed → done, confirmedBy member', async () => {
    const { member, t } = await setup('member');
    await postUpdate(testDb, member, t.id, upd(['A'], { memberConfirmed: true }), T0);
    expect(await stepsOf(t.id)).toEqual([
      { title: 'A', status: 'done', confirmedBy: 'member', confirmedById: member.id, confirmedAt: T0.toISOString(), confirmedVia: 'agent' },
      { title: 'B', status: 'todo' },
    ]);
  });
  it('via defaults to agent and can be set to web', async () => {
    const { member, t } = await setup('member');
    await postUpdate(testDb, member, t.id, { ...upd(['A'], { memberConfirmed: true }), via: 'web' }, T0);
    expect((await stepsOf(t.id))[0].confirmedVia).toBe('web');
  });
  it('re-reporting an already done step is a no-op and needs no confirmation', async () => {
    const { member, t } = await setup('member');
    await postUpdate(testDb, member, t.id, upd(['A'], { memberConfirmed: true }), T0);
    const before = await stepsOf(t.id);
    await postUpdate(testDb, member, t.id, upd(['A']), T1);
    expect(await stepsOf(t.id)).toEqual(before);
  });
});

describe('postUpdate with manager confirmer', () => {
  it('step becomes pending_approval, memberConfirmed ignored', async () => {
    const { member, t } = await setup('manager');
    await postUpdate(testDb, member, t.id, upd(['A'], { memberConfirmed: true }), T0);
    expect(await stepsOf(t.id)).toEqual([{ title: 'A', status: 'pending_approval' }, { title: 'B', status: 'todo' }]);
    await postUpdate(testDb, member, t.id, upd(['B']), T0);
    expect((await stepsOf(t.id))[1]).toEqual({ title: 'B', status: 'pending_approval' });
  });
});

describe('reviewCheckpoint', () => {
  async function pending() {
    const s = await setup('manager');
    await postUpdate(testDb, s.member, s.t.id, upd(['A', 'B']), T0);
    return s;
  }
  it('approve one step → done, confirmedBy manager, history row', async () => {
    const { manager, t } = await pending();
    const r = await reviewCheckpoint(testDb, manager, t.id, 'A', 'approved', undefined, 'web', T1);
    expect(r).toEqual({ approved: 1, rejected: 0 });
    expect(await stepsOf(t.id)).toEqual([
      { title: 'A', status: 'done', confirmedBy: 'manager', confirmedById: manager.id, confirmedAt: T1.toISOString(), confirmedVia: 'web' },
      { title: 'B', status: 'pending_approval' },
    ]);
    const rows = await testDb.select().from(checkpointReviews).where(eq(checkpointReviews.taskId, t.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stepTitle: 'A', decision: 'approved', reviewerId: manager.id });
  });
  it('via agent is recorded on approval', async () => {
    const { manager, t } = await pending();
    await reviewCheckpoint(testDb, manager, t.id, 'A', 'approved', undefined, 'agent', T1);
    expect((await stepsOf(t.id))[0]).toMatchObject({ status: 'done', confirmedVia: 'agent' });
  });
  it('legacy done step without confirmedVia is left untouched', async () => {
    const conf = { confirmedBy: 'member' as const, confirmedById: 'u1', confirmedAt: '2026-11-23T01:00:00.000Z' };
    const s = await setup('manager', {}, ['A', 'B']);
    await testDb.update(planVersions).set({ steps: [{ title: 'A', status: 'done', ...conf }, { title: 'B', status: 'pending_approval' }] }).where(eq(planVersions.taskId, s.t.id));
    await reviewCheckpoint(testDb, s.manager, s.t.id, null, 'approved', undefined, 'web', T1);
    const steps = await stepsOf(s.t.id);
    expect(steps[0]).toEqual({ title: 'A', status: 'done', ...conf });
    expect(steps[1].confirmedVia).toBe('web');
  });
  it('approve all (stepTitle null) confirms every pending step only', async () => {
    const { manager, member, t } = await setup('manager', {}, ['A', 'B', 'C']);
    await postUpdate(testDb, member, t.id, upd(['A', 'B']), T0);
    const r = await reviewCheckpoint(testDb, manager, t.id, null, 'approved', undefined, 'web', T1);
    expect(r).toEqual({ approved: 2, rejected: 0 });
    const steps = await stepsOf(t.id);
    expect(steps.map((x) => x.status)).toEqual(['done', 'done', 'todo']);
    expect(steps[0].confirmedBy).toBe('manager');
    expect(steps.slice(0, 2).map((x) => x.confirmedVia)).toEqual(['web', 'web']);
    expect(steps[2].confirmedVia).toBeUndefined();
    await expect(reviewCheckpoint(testDb, manager, t.id, null, 'approved', undefined, 'web'))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'stepNotPending' });
  });
  it('rejected without note → VALIDATION field note, nothing changes', async () => {
    const { manager, t } = await pending();
    await expect(reviewCheckpoint(testDb, manager, t.id, 'A', 'rejected', undefined, 'web'))
      .rejects.toMatchObject({ code: 'VALIDATION', params: { field: 'note' } });
    await expect(reviewCheckpoint(testDb, manager, t.id, 'A', 'rejected', '   ', 'web'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
  });
  it('stepTitle null with rejected → VALIDATION', async () => {
    const { manager, t } = await pending();
    await expect(reviewCheckpoint(testDb, manager, t.id, null, 'rejected', 'no', 'web'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
  });
  it('rejected with note → doing, appears in rejectedCheckpoints until the step is reported again', async () => {
    const { manager, member, t } = await pending();
    const r = await reviewCheckpoint(testDb, manager, t.id, 'A', 'rejected', ' Thiếu test ', 'web', T1);
    expect(r).toEqual({ approved: 0, rejected: 1 });
    expect((await stepsOf(t.id))[0]).toEqual({ title: 'A', status: 'doing' });
    const fb = await getPendingFeedback(testDb, member);
    expect(fb.rejectedCheckpoints).toEqual([
      { taskId: t.id, title: t.title, stepTitle: 'A', note: 'Thiếu test', at: T1 },
    ]);
    // other owner/manager do not see it
    expect((await getPendingFeedback(testDb, manager)).rejectedCheckpoints).toEqual([]);
    await postUpdate(testDb, member, t.id, upd(['A']), new Date('2026-11-23T05:00:00Z'));
    expect((await getPendingFeedback(testDb, member)).rejectedCheckpoints).toEqual([]);
    const [row] = await testDb.select().from(checkpointReviews).where(eq(checkpointReviews.stepTitle, 'A'));
    expect(row.consumedAt).not.toBeNull();
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
  });
  it('reporting a different step does not consume the rejection', async () => {
    const { manager, member, t } = await pending();
    await reviewCheckpoint(testDb, manager, t.id, 'A', 'rejected', 'n', 'web', T1);
    await postUpdate(testDb, member, t.id, upd(['B']), T1);
    expect((await getPendingFeedback(testDb, member)).rejectedCheckpoints).toHaveLength(1);
  });
  it('step that is not pending → VALIDATION stepNotPending; unknown step → unknownSteps', async () => {
    const { manager, member, t } = await setup('manager');
    await expect(reviewCheckpoint(testDb, manager, t.id, 'A', 'approved', undefined, 'web'))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'stepNotPending' });
    await expect(reviewCheckpoint(testDb, manager, t.id, 'Z', 'approved', undefined, 'web'))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'unknownSteps' });
    expect(member).toBeTruthy();
  });
  it('owner reviewing their own step, strangers, admin and a skip-level manager all get NOT_FOUND', async () => {
    const { manager, member, t } = await pending();
    const stranger = await makeUser();
    const admin = await makeUser({ isAdmin: true });
    const top = await makeUser({ level: 'director' });
    await testDb.update(users).set({ managerId: top.id }).where(eq(users.id, manager.id));
    for (const who of [member, stranger, admin, top]) {
      await expect(reviewCheckpoint(testDb, who, t.id, 'A', 'approved', undefined, 'web')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    await expect(reviewCheckpoint(testDb, member, 'bad-id', null, 'approved', undefined, 'web')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
  });
});

describe('Review focus 2: manager change and confirmer change with pending steps', () => {
  it('after a manager change the old manager gets NOT_FOUND and the new one can approve', async () => {
    const { manager: m1, member, t } = await setup('manager');
    await postUpdate(testDb, member, t.id, upd(['A']), T0);
    const m2 = await makeUser({ level: 'manager' });
    await testDb.update(users).set({ managerId: m2.id }).where(eq(users.id, member.id));
    await expect(reviewCheckpoint(testDb, m1, t.id, 'A', 'approved', undefined, 'web')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
    await reviewCheckpoint(testDb, m2, t.id, 'A', 'approved', undefined, 'web', T1);
    expect((await stepsOf(t.id))[0]).toMatchObject({ status: 'done', confirmedBy: 'manager', confirmedById: m2.id });
  });
  it('switching manager → member keeps the pending step; manager can still approve', async () => {
    const { manager, member, t } = await setup('manager');
    await postUpdate(testDb, member, t.id, upd(['A']), T0);
    await setCheckpointConfirmer(testDb, manager, member.id, 'member');
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
    await reviewCheckpoint(testDb, manager, t.id, 'A', 'approved', undefined, 'web', T1);
    expect((await stepsOf(t.id))[0]).toMatchObject({ status: 'done', confirmedBy: 'manager' });
  });
  it('switching manager → member: member re-reporting a pending step needs and honours memberConfirmed', async () => {
    const { manager, member, t } = await setup('manager');
    await postUpdate(testDb, member, t.id, upd(['A']), T0);
    await setCheckpointConfirmer(testDb, manager, member.id, 'member');
    await expect(postUpdate(testDb, member, t.id, upd(['A']), T1))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'checkpointConfirmationRequired' });
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
    await postUpdate(testDb, member, t.id, upd(['A'], { memberConfirmed: true }), T1);
    expect((await stepsOf(t.id))[0]).toMatchObject({ status: 'done', confirmedBy: 'member', confirmedById: member.id });
  });
  it('switching member → manager applies to later reports', async () => {
    const { manager, member, t } = await setup('member');
    await setCheckpointConfirmer(testDb, manager, member.id, 'manager');
    await postUpdate(testDb, member, t.id, upd(['A']), T0);
    expect((await stepsOf(t.id))[0].status).toBe('pending_approval');
  });
});

describe('owner loses their manager while a step is pending', () => {
  it('effective confirmer becomes member; member re-report with memberConfirmed → done; old manager NOT_FOUND', async () => {
    const { manager, member, t } = await setup('manager');
    await postUpdate(testDb, member, t.id, upd(['A']), T0);
    await testDb.update(users).set({ managerId: null }).where(eq(users.id, member.id));
    await expect(reviewCheckpoint(testDb, manager, t.id, 'A', 'approved', undefined, 'web')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(postUpdate(testDb, member, t.id, upd(['A']), T1))
      .rejects.toMatchObject({ key: 'checkpointConfirmationRequired' });
    await postUpdate(testDb, member, t.id, upd(['A'], { memberConfirmed: true }), T1);
    expect((await stepsOf(t.id))[0]).toMatchObject({ status: 'done', confirmedBy: 'member' });
  });
});

describe('changePlan clears rejections of steps that no longer exist', () => {
  async function rejected() {
    const s = await setup('manager');
    await postUpdate(testDb, s.member, s.t.id, upd(['A']), T0);
    await reviewCheckpoint(testDb, s.manager, s.t.id, 'A', 'rejected', 'redo', 'web', T1);
    return s;
  }
  it('renaming A to A2 consumes the rejection', async () => {
    const { member, t } = await rejected();
    await changePlan(testDb, member, t.id, { steps: [{ title: 'A2', status: 'todo' }, { title: 'B', status: 'todo' }] });
    expect((await getPendingFeedback(testDb, member)).rejectedCheckpoints).toEqual([]);
  });
  it('keeping A keeps the rejection listed', async () => {
    const { member, t } = await rejected();
    await changePlan(testDb, member, t.id, { steps: [{ title: 'A', status: 'doing' }, { title: 'C', status: 'todo' }] });
    expect((await getPendingFeedback(testDb, member)).rejectedCheckpoints).toHaveLength(1);
  });
});

describe('Review focus 3: private task or owner without manager behaves as member', () => {
  it('private task of a manager-configured owner needs memberConfirmed and goes straight to done', async () => {
    const { member, t } = await setup('manager', { isPrivate: true });
    await expect(postUpdate(testDb, member, t.id, upd(['A']), T0))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'checkpointConfirmationRequired' });
    await postUpdate(testDb, member, t.id, upd(['A'], { memberConfirmed: true }), T0);
    expect((await stepsOf(t.id))[0]).toMatchObject({ status: 'done', confirmedBy: 'member' });
    // never pending, and the manager cannot review (task is invisible to them)
  });
  it('manager cannot review a private task', async () => {
    const { manager, t } = await setup('manager', { isPrivate: true });
    await expect(reviewCheckpoint(testDb, manager, t.id, null, 'approved', undefined, 'web')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('owner without a manager configured as manager still confirms themselves', async () => {
    const solo = await makeUser({ checkpointConfirmer: 'manager' });
    const t = await makeTask(solo.id, { status: 'in_progress', steps: ['A'] });
    await expect(postUpdate(testDb, solo, t.id, upd(['A']), T0))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'checkpointConfirmationRequired' });
    await postUpdate(testDb, solo, t.id, upd(['A'], { memberConfirmed: true }), T0);
    expect((await stepsOf(t.id))[0]).toMatchObject({ status: 'done', confirmedBy: 'member' });
  });
});

describe('setTaskStatus complete requires all steps done', () => {
  it('pending_approval / todo steps → stepsNotConfirmed; all done → ok', async () => {
    const { manager, member, t } = await setup('manager');
    await expect(setTaskStatus(testDb, member, t.id, 'complete'))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'stepsNotConfirmed' });
    await postUpdate(testDb, member, t.id, upd(['A', 'B']), T0);
    await expect(setTaskStatus(testDb, member, t.id, 'complete'))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'stepsNotConfirmed' });
    await reviewCheckpoint(testDb, manager, t.id, null, 'approved', undefined, 'web', T1);
    const done = await setTaskStatus(testDb, member, t.id, 'complete', undefined, T1);
    expect(['awaiting_review', 'done']).toContain(done.status);
  });
  it('applies to private tasks and ownerless-manager tasks too', async () => {
    const solo = await makeUser();
    const t = await makeTask(solo.id, { status: 'in_progress', steps: ['A'] });
    await expect(setTaskStatus(testDb, solo, t.id, 'complete')).rejects.toMatchObject({ key: 'stepsNotConfirmed' });
    await postUpdate(testDb, solo, t.id, upd(['A'], { memberConfirmed: true }), T0);
    expect((await setTaskStatus(testDb, solo, t.id, 'complete')).status).toBe('done');
  });
});
