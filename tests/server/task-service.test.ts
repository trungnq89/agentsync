import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { managerFeedback, planVersions, solutionSummaries, tasks } from '@/db/schema';
import {
  changePlan, confirmTask, createTask, getCurrentPlan, makePublic, requestChanges, setTaskStatus,
} from '@/server/tasks/service';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

const base = {
  title: 'Việc A', mode: 'executive' as const, agreedOutcome: 'Kết quả',
  startDate: '2026-11-23', agreedDueDate: '2026-11-30', steps: ['B1', 'B2'],
};

/** Test shortcut: mark every plan step confirmed (the confirmation flow is tested in confirm.test.ts). */
async function allStepsDone(taskId: string) {
  const plan = await getCurrentPlan(testDb, taskId);
  await testDb.update(planVersions)
    .set({ steps: plan.steps.map((s) => ({ ...s, status: 'done' as const })) })
    .where(eq(planVersions.id, plan.id));
}

async function pair() {
  const manager = await makeUser({ level: 'manager' });
  const member = await makeUser({ managerId: manager.id });
  return { manager, member };
}

describe('task service', () => {
  it('create → pending_confirmation when owner has manager', async () => {
    const { manager, member } = await pair();
    const t = await createTask(testDb, member, base);
    expect(t.status).toBe('pending_confirmation');
    expect(t.confirmerIdAtCreation).toBe(manager.id);
    expect(t.expectedEndDate).toBe('2026-11-30');
    const plan = await getCurrentPlan(testDb, t.id);
    expect(plan.version).toBe(1);
    expect(plan.kind).toBe('initial');
    expect(plan.steps).toEqual([{ title: 'B1', status: 'todo' }, { title: 'B2', status: 'todo' }]);
  });

  it('create → in_progress when private', async () => {
    const { member } = await pair();
    const t = await createTask(testDb, member, { ...base, isPrivate: true });
    expect(t.status).toBe('in_progress');
  });

  it('create → in_progress when owner has no manager', async () => {
    const solo = await makeUser();
    const t = await createTask(testDb, solo, base);
    expect(t.status).toBe('in_progress');
    expect(t.confirmerIdAtCreation).toBeNull();
  });

  it('create validates steps and dates', async () => {
    const solo = await makeUser();
    await expect(createTask(testDb, solo, { ...base, steps: [] })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createTask(testDb, solo, { ...base, agreedDueDate: '2026-11-01' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('manager confirms → in_progress; non-manager confirm → NOT_FOUND', async () => {
    const { manager, member } = await pair();
    const other = await makeUser();
    const t = await createTask(testDb, member, base);
    await expect(confirmTask(testDb, other, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(confirmTask(testDb, member, t.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const now = new Date('2026-11-23T03:00:00Z');
    const c = await confirmTask(testDb, manager, t.id, now);
    expect(c.status).toBe('in_progress');
    expect(c.confirmedAt).toEqual(now);
    expect(c.statusChangedAt).toEqual(now);
  });

  it('request changes then changePlan resubmits and consumes feedback', async () => {
    const { manager, member } = await pair();
    const t = await createTask(testDb, member, base);
    await expect(() => requestChanges(testDb, manager, t.id, '  ')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION', key: 'noteRequiredForChanges', params: { field: 'note' } }),
    );
    const r = await requestChanges(testDb, manager, t.id, 'Thêm bước test');
    expect(r.status).toBe('changes_requested');
    const [fb] = await testDb.select().from(managerFeedback).where(eq(managerFeedback.taskId, t.id));
    expect(fb.note).toBe('Thêm bước test');
    expect(fb.consumedAt).toBeNull();
    await expect(changePlan(testDb, manager, t.id, { steps: [{ title: 'x', status: 'todo' }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const out = await changePlan(testDb, member, t.id, { steps: [{ title: 'B1', status: 'todo' }, { title: 'Test', status: 'todo' }] });
    expect(out.status).toBe('pending_confirmation');
    const plan = await getCurrentPlan(testDb, t.id);
    expect(plan.version).toBe(2);
    expect(plan.kind).toBe('revision');
    const [fb2] = await testDb.select().from(managerFeedback).where(eq(managerFeedback.taskId, t.id));
    expect(fb2.consumedAt).not.toBeNull();
  });

  it('project plan edit within 24h → kind edit, no reason needed', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { mode: 'project', status: 'in_progress' });
    const [v] = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
    const now = new Date(v.createdAt.getTime() + 23 * 3600_000);
    await changePlan(testDb, member, t.id, { steps: [{ title: 'N', status: 'doing' }], expectedEndDate: '2026-12-05' }, now);
    const plan = await getCurrentPlan(testDb, t.id);
    expect(plan.kind).toBe('edit');
    expect(plan.version).toBe(2);
    const [row] = await testDb.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.expectedEndDate).toBe('2026-12-05');
  });

  it('project plan after 24h without reason → EDIT_WINDOW_CLOSED; with reason → kind revision', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { mode: 'project', status: 'in_progress' });
    const [v] = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
    const now = new Date(v.createdAt.getTime() + 25 * 3600_000);
    const steps = [{ title: 'N', status: 'todo' as const }];
    await expect(changePlan(testDb, member, t.id, { steps }, now)).rejects.toMatchObject({
      code: 'EDIT_WINDOW_CLOSED',
      key: 'planLocked',
    });
    await changePlan(testDb, member, t.id, { steps, reason: 'Đổi hướng' }, now);
    const plan = await getCurrentPlan(testDb, t.id);
    expect(plan.kind).toBe('revision');
    expect(plan.reason).toBe('Đổi hướng');
  });

  it('executive plan edit after 10 days without reason → kind edit, version increments', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { mode: 'executive', status: 'in_progress' });
    const [v] = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
    const now = new Date(v.createdAt.getTime() + 10 * 24 * 3600_000);
    await changePlan(testDb, member, t.id, { steps: [{ title: 'N', status: 'todo' }] }, now);
    const plan = await getCurrentPlan(testDb, t.id);
    expect(plan.kind).toBe('edit');
    expect(plan.version).toBe(2);
  });

  it('pause without reason → VALIDATION', async () => {
    const solo = await makeUser();
    const t = await makeTask(solo.id, { status: 'in_progress' });
    await expect(setTaskStatus(testDb, solo, t.id, 'pause')).rejects.toMatchObject({ code: 'VALIDATION' });
    const p = await setTaskStatus(testDb, solo, t.id, 'pause', 'Chờ đối tác');
    expect(p.status).toBe('paused');
    expect(p.statusReason).toBe('Chờ đối tác');
    const r = await setTaskStatus(testDb, solo, t.id, 'resume');
    expect(r.status).toBe('in_progress');
  });

  it('complete project task without solution → VALIDATION', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { mode: 'project', status: 'in_progress' });
    await expect(setTaskStatus(testDb, member, t.id, 'complete')).rejects.toMatchObject({
      code: 'VALIDATION',
      key: 'summaryRequiredBeforeDone',
    });
    await testDb.insert(solutionSummaries).values({
      taskId: t.id, problem: 'p', solution: 's', rejectedAlternatives: 'r', keyChanges: 'k', risks: 'x', testing: 't',
    });
    await allStepsDone(t.id);
    const done = await setTaskStatus(testDb, member, t.id, 'complete');
    expect(done.status).toBe('awaiting_review');
    expect(done.completedAt).not.toBeNull();
  });

  it('makePublic on private task of member with manager → pending_confirmation', async () => {
    const { manager, member } = await pair();
    const t = await createTask(testDb, member, { ...base, isPrivate: true });
    await expect(makePublic(testDb, manager, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const pub = await makePublic(testDb, member, t.id);
    expect(pub.isPrivate).toBe(false);
    expect(pub.status).toBe('pending_confirmation');
    expect(pub.confirmerIdAtCreation).toBe(manager.id);
    await expect(makePublic(testDb, member, t.id)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('private project task completes to done without a summary', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { mode: 'project', status: 'in_progress', isPrivate: true });
    await allStepsDone(t.id);
    const done = await setTaskStatus(testDb, member, t.id, 'complete');
    expect(done.status).toBe('done');
  });

  it('makePublic rejects terminal statuses; no manager keeps status', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { status: 'cancelled', isPrivate: true });
    await expect(makePublic(testDb, member, t.id)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    const solo = await makeUser();
    const t2 = await makeTask(solo.id, { status: 'paused', isPrivate: true });
    const pub = await makePublic(testDb, solo, t2.id);
    expect(pub.isPrivate).toBe(false);
    expect(pub.status).toBe('paused');
  });

  it('project plan 24h boundary: exactly 24h → edit; 24h + 1s without reason → EDIT_WINDOW_CLOSED', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { mode: 'project', status: 'in_progress' });
    const [v] = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
    const steps = [{ title: 'N', status: 'todo' as const }];
    await expect(changePlan(testDb, member, t.id, { steps }, new Date(v.createdAt.getTime() + 24 * 3600_000 + 1000)))
      .rejects.toMatchObject({ code: 'EDIT_WINDOW_CLOSED' });
    await changePlan(testDb, member, t.id, { steps }, new Date(v.createdAt.getTime() + 24 * 3600_000));
    expect((await getCurrentPlan(testDb, t.id)).kind).toBe('edit');
  });

  it('concurrent confirm and cancel end in a serially valid state', async () => {
    for (let i = 0; i < 5; i++) {
      const { manager, member } = await pair();
      const t = await createTask(testDb, member, base);
      const [a, b] = await Promise.allSettled([
        confirmTask(testDb, manager, t.id),
        setTaskStatus(testDb, member, t.id, 'cancel', 'Hủy'),
      ]);
      const [row] = await testDb.select().from(tasks).where(eq(tasks.id, t.id));
      if (a.status === 'fulfilled' && b.status === 'fulfilled') {
        expect(row.status).toBe('cancelled'); // confirm then cancel
      } else {
        // cancel first: confirm must have been rejected, never in_progress after cancelled
        expect(b.status).toBe('fulfilled');
        expect(a.status).toBe('rejected');
        expect((a as PromiseRejectedResult).reason).toMatchObject({ code: 'INVALID_TRANSITION' });
        expect(row.status).toBe('cancelled');
      }
    }
  });
});

describe('date validation', () => {
  it('createTask and changePlan reject malformed dates', async () => {
    const { member } = await pair();
    await expect(createTask(testDb, member, { ...base, startDate: 'next week' }))
      .rejects.toMatchObject({ code: 'VALIDATION', key: 'invalidDate' });
    await expect(createTask(testDb, member, { ...base, agreedDueDate: '2026-02-30' }))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    const t = await createTask(testDb, member, base);
    await expect(changePlan(testDb, member, t.id, { steps: [{ title: 'x', status: 'todo' }], expectedEndDate: 'soon' }))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
