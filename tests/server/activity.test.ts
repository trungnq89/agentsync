import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { tasks, updates } from '@/db/schema';
import {
  answerQuestion, askQuestion, deleteUpdate, editUpdate, getPendingFeedback, postUpdate,
  reviewSolution, submitSolutionSummary,
} from '@/server/tasks/activity';
import { getCurrentPlan, requestChanges, setTaskStatus } from '@/server/tasks/service';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

async function pair() {
  const manager = await makeUser({ level: 'manager' });
  const member = await makeUser({ managerId: manager.id });
  return { manager, member };
}
const T0 = new Date('2026-11-23T03:00:00Z');
const upd = { body: 'Đã làm', source: 'auto' as const };
const summary = { problem: 'p', solution: 's', rejectedAlternatives: 'r', keyChanges: 'k', risks: 'x', testing: 't' };

describe('activity', () => {
  it("postUpdate on someone else's task → NOT_FOUND mentioning list_my_tasks", async () => {
    const { manager, member } = await pair();
    const t = await makeTask(member.id, { status: 'in_progress' });
    await expect(postUpdate(testDb, manager, t.id, upd, T0)).rejects.toMatchObject({
      code: 'NOT_FOUND', message: expect.stringContaining('list_my_tasks'),
    });
    const stranger = await makeUser();
    await expect(postUpdate(testDb, stranger, t.id, upd, T0)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(postUpdate(testDb, member, 'bad-id', upd, T0)).rejects.toMatchObject({
      code: 'NOT_FOUND', message: expect.stringContaining('list_my_tasks'),
    });
  });

  it('postUpdate on cancelled task → INVALID_TRANSITION', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { status: 'cancelled' });
    await expect(postUpdate(testDb, member, t.id, upd, T0)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(await testDb.select().from(updates)).toHaveLength(0);
  });

  it('stepsCompleted marks steps done in current plan; progress and end date saved', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { status: 'in_progress', steps: ['A', 'B'] });
    await postUpdate(testDb, member, t.id, {
      ...upd, stepsCompleted: ['A'], progressPct: 50, expectedEndDate: '2026-12-05',
    }, T0);
    const plan = await getCurrentPlan(testDb, t.id);
    expect(plan.version).toBe(1);
    expect(plan.steps).toEqual([{ title: 'A', status: 'done' }, { title: 'B', status: 'todo' }]);
    const [row] = await testDb.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.progressOverride).toBe(50);
    expect(row.expectedEndDate).toBe('2026-12-05');
    await expect(postUpdate(testDb, member, t.id, { ...upd, progressPct: 101 }, T0)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(postUpdate(testDb, member, t.id, { ...upd, progressPct: 1.5 }, T0)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('editUpdate at +23h59m ok, at +24h01m EDIT_WINDOW_CLOSED', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { status: 'in_progress' });
    const u = await postUpdate(testDb, member, t.id, upd, T0);
    const ok = await editUpdate(testDb, member, u.id, 'Sửa', new Date(T0.getTime() + (23 * 60 + 59) * 60000));
    expect(ok.body).toBe('Sửa');
    expect(ok.editedAt).not.toBeNull();
    await expect(
      editUpdate(testDb, member, u.id, 'Muộn', new Date(T0.getTime() + (24 * 60 + 1) * 60000)),
    ).rejects.toMatchObject({ code: 'EDIT_WINDOW_CLOSED' });
  });

  it('deleteUpdate on public task → FORBIDDEN; on private task ok', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { status: 'in_progress' });
    const u = await postUpdate(testDb, member, t.id, upd, T0);
    await expect(deleteUpdate(testDb, member, u.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const p = await makeTask(member.id, { status: 'in_progress', isPrivate: true });
    const pu = await postUpdate(testDb, member, p.id, upd, T0);
    await deleteUpdate(testDb, member, pu.id);
    expect(await testDb.select().from(updates).where(eq(updates.id, pu.id))).toHaveLength(0);
  });

  it("manager question appears in owner's getPendingFeedback.questionsForMe; disappears after answer", async () => {
    const { manager, member } = await pair();
    const t = await makeTask(member.id, { status: 'in_progress' });
    const q = await askQuestion(testDb, manager, t.id, 'Bao giờ xong?', { isBlocker: true }, T0);
    expect(q.direction).toBe('manager_to_member');
    expect(q.isBlocker).toBe(false);
    const before = await getPendingFeedback(testDb, member);
    expect(before.questionsForMe.map((x) => x.questionId)).toEqual([q.id]);
    await expect(answerQuestion(testDb, manager, q.id, 'tự trả lời', T0)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await answerQuestion(testDb, member, q.id, 'Thứ 6', T0);
    expect((await getPendingFeedback(testDb, member)).questionsForMe).toEqual([]);
    const mine = await getPendingFeedback(testDb, manager);
    expect(mine.answersToMyQuestions.map((x) => x.questionId)).toEqual([q.id]);
  });

  it('reviewSolution changes_needed → in_progress and shows in reviewResults', async () => {
    const { manager, member } = await pair();
    const t = await makeTask(member.id, { status: 'awaiting_review', mode: 'project', completedAt: T0 });
    await expect(reviewSolution(testDb, member, t.id, 'approved', undefined, T0)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(reviewSolution(testDb, manager, t.id, 'changes_needed', '  ', T0)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(reviewSolution(testDb, manager, t.id, 'changes_needed', undefined, T0)).rejects.toMatchObject({ code: 'VALIDATION' });
    const r = await reviewSolution(testDb, manager, t.id, 'changes_needed', 'Thiếu test', T0);
    expect(r.status).toBe('in_progress');
    expect(r.completedAt).toBeNull();
    const fb = await getPendingFeedback(testDb, member);
    expect(fb.reviewResults).toEqual([{ taskId: t.id, title: t.title, verdict: 'changes_needed', note: 'Thiếu test' }]);
  });

  it('submitSolutionSummary on executive task → VALIDATION; upserts on project', async () => {
    const { member } = await pair();
    const e = await makeTask(member.id, { status: 'in_progress' });
    await expect(submitSolutionSummary(testDb, member, e.id, summary, T0)).rejects.toMatchObject({ code: 'VALIDATION' });
    const p = await makeTask(member.id, { status: 'in_progress', mode: 'project' });
    await submitSolutionSummary(testDb, member, p.id, summary, T0);
    const s = await submitSolutionSummary(testDb, member, p.id, { ...summary, solution: 'mới' }, T0);
    expect(s.solution).toBe('mới');
  });

  it('changesRequested lists only tasks currently in changes_requested', async () => {
    const { manager, member } = await pair();
    const t = await makeTask(member.id, { status: 'pending_confirmation' });
    await requestChanges(testDb, manager, t.id, 'Làm lại', T0);
    expect((await getPendingFeedback(testDb, member)).changesRequested).toEqual([{ taskId: t.id, title: t.title, note: 'Làm lại' }]);
    await setTaskStatus(testDb, member, t.id, 'cancel', 'bỏ', T0);
    expect((await getPendingFeedback(testDb, member)).changesRequested).toEqual([]);
  });

  it('postUpdate with unknown stepsCompleted → VALIDATION, no writes', async () => {
    const { member } = await pair();
    const t = await makeTask(member.id, { status: 'in_progress', steps: ['A'] });
    await expect(postUpdate(testDb, member, t.id, { ...upd, stepsCompleted: ['A', 'X', 'Y'] }, T0)).rejects.toMatchObject({
      code: 'VALIDATION', message: expect.stringContaining('X, Y'),
    });
    expect(await testDb.select().from(updates)).toHaveLength(0);
    expect((await getCurrentPlan(testDb, t.id)).steps[0].status).toBe('todo');
  });
});

describe('postUpdate date validation', () => {
  it('rejects a malformed expectedEndDate', async () => {
    const member = await makeUser();
    const t = await makeTask(member.id, { status: 'in_progress' });
    await expect(postUpdate(testDb, member, t.id, { body: 'x', source: 'auto', expectedEndDate: 'soon' }, new Date()))
      .rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('YYYY-MM-DD') });
  });
});
