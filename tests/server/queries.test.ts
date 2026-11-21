import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { tasks, updates, questions, planVersions } from '@/db/schema';
import {
  listMyTasks, needsAttention, personTimeline, taskDetail, teamOverview, weeklyDigest,
} from '@/server/tasks/queries';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

const NOW = new Date('2026-11-25T03:00:00Z'); // Wed 10:00 VN
const recent = new Date('2026-11-25T01:00:00Z');

async function chain() {
  const director = await makeUser({ level: 'director' });
  const manager = await makeUser({ level: 'manager', managerId: director.id });
  const leader = await makeUser({ level: 'leader', managerId: manager.id });
  const member = await makeUser({ level: 'member', managerId: leader.id });
  return { director, manager, leader, member };
}

describe('teamOverview', () => {
  it('director sees self + manager only; private task not counted for others', async () => {
    const { director, manager, leader } = await chain();
    await makeTask(manager.id, { status: 'in_progress', statusChangedAt: recent });
    await makeTask(manager.id, { status: 'in_progress', isPrivate: true });
    await makeTask(leader.id, { status: 'in_progress' });
    const asDirector = await teamOverview(testDb, director, NOW);
    expect(asDirector.tiers.map((t) => t.level)).toEqual(['director', 'manager']);
    const mCard = asDirector.tiers[1].people[0];
    expect(mCard.userId).toBe(manager.id);
    expect(mCard.activeCount).toBe(1);
    const asManager = await teamOverview(testDb, manager, NOW);
    expect(asManager.tiers.map((t) => t.level)).toEqual(['manager', 'leader']);
    expect(asManager.tiers[0].people[0].activeCount).toBe(2);
  });
  it('counts done in 30d, blocked, awaiting review', async () => {
    const { manager, leader } = await chain();
    await makeTask(leader.id, { status: 'done', completedAt: new Date('2026-11-10T00:00:00Z') });
    await makeTask(leader.id, { status: 'done', completedAt: new Date('2026-09-01T00:00:00Z') });
    const t = await makeTask(leader.id, { status: 'in_progress' });
    await makeTask(leader.id, { status: 'awaiting_review', mode: 'project' });
    await testDb.insert(questions).values({
      taskId: t.id, authorId: leader.id, direction: 'member_to_manager', body: 'x', isBlocker: true,
    });
    const card = (await teamOverview(testDb, manager, NOW)).tiers[1].people[0];
    expect(card).toMatchObject({ doneCount30d: 1, activeCount: 2, hasBlocked: true, hasAwaitingReview: true });
  });
});

describe('needsAttention', () => {
  it('excludes private pending task; includes awaiting_review', async () => {
    const { leader, manager } = await chain();
    await makeTask(leader.id, { status: 'pending_confirmation', isPrivate: true, title: 'Riêng' });
    const t = await makeTask(leader.id, { status: 'awaiting_review', mode: 'project', title: 'Chờ review' });
    const items = await needsAttention(testDb, manager, NOW);
    expect(items.map((i) => i.taskId)).toEqual([t.id]);
    expect(items[0]).toMatchObject({ kind: 'awaiting_review', ownerName: leader.displayName });
  });
  it('blocked, overdue, stale, paused/cancelled within 7d, sorted by kind', async () => {
    const { leader, manager } = await chain();
    const blocked = await makeTask(leader.id, { status: 'in_progress', statusChangedAt: recent });
    await testDb.insert(questions).values({
      taskId: blocked.id, authorId: leader.id, direction: 'member_to_manager', body: 'kẹt', isBlocker: true,
    });
    await makeTask(leader.id, { status: 'in_progress', agreedDueDate: '2026-11-20', expectedEndDate: '2026-11-20', statusChangedAt: recent });
    await makeTask(leader.id, {
      status: 'in_progress', createdAt: new Date('2026-11-16T03:00:00Z'), statusChangedAt: new Date('2026-11-16T03:00:00Z'),
    });
    await makeTask(leader.id, { status: 'paused', statusChangedAt: new Date('2026-11-23T03:00:00Z'), statusReason: 'chờ' });
    await makeTask(leader.id, { status: 'cancelled', statusChangedAt: new Date('2026-11-01T03:00:00Z') });
    const kinds = (await needsAttention(testDb, manager, NOW)).map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['blocked', 'overdue', 'stale', 'paused_or_cancelled']));
    expect(kinds.filter((k) => k === 'paused_or_cancelled')).toHaveLength(1);
    const order = ['pending_confirmation', 'awaiting_review', 'blocked', 'overdue', 'stale', 'paused_or_cancelled'];
    const idx = kinds.map((k) => order.indexOf(k));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it("owner's own changes_requested and question_for_me", async () => {
    const { leader, manager } = await chain();
    const t = await makeTask(leader.id, { status: 'changes_requested' });
    const { managerFeedback } = await import('@/db/schema');
    await testDb.insert(managerFeedback).values({ taskId: t.id, authorId: manager.id, kind: 'changes_requested', note: 'sửa lại' });
    const t2 = await makeTask(leader.id, { status: 'in_progress' });
    await testDb.insert(questions).values({ taskId: t2.id, authorId: manager.id, direction: 'manager_to_member', body: 'Sao?' });
    const items = await needsAttention(testDb, leader, NOW);
    expect(items.map((i) => i.kind)).toEqual(['changes_requested', 'question_for_me']);
    expect(items[0].detail).toBe('sửa lại');
  });
});

describe('personTimeline', () => {
  it('non-report → NOT_FOUND; report shows active and recent done only', async () => {
    const { director, leader, manager } = await chain();
    await expect(personTimeline(testDb, director, leader.id, NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await makeTask(leader.id, { status: 'in_progress' });
    await makeTask(leader.id, { status: 'in_progress', isPrivate: true });
    await makeTask(leader.id, { status: 'done', completedAt: new Date('2026-11-20T00:00:00Z') });
    await makeTask(leader.id, { status: 'done', completedAt: new Date('2026-08-20T00:00:00Z') });
    const r = await personTimeline(testDb, manager, leader.id, NOW);
    expect(r.person.id).toBe(leader.id);
    expect(r.tasks).toHaveLength(2);
    expect(r.tasks[0]).toMatchObject({ progress: 0, health: 'on_track' });
    const own = await personTimeline(testDb, leader, leader.id, NOW);
    expect(own.tasks).toHaveLength(3);
  });
});

describe('taskDetail', () => {
  it('returns flags and details; hides private from manager', async () => {
    const { leader, manager, director } = await chain();
    const t = await makeTask(leader.id, { status: 'awaiting_review', mode: 'project' });
    await testDb.insert(updates).values([
      { taskId: t.id, authorId: leader.id, body: 'cũ', source: 'auto', createdAt: new Date('2026-11-24T00:00:00Z') },
      { taskId: t.id, authorId: leader.id, body: 'mới', source: 'auto', createdAt: new Date('2026-11-25T00:00:00Z') },
    ]);
    const asMgr = await taskDetail(testDb, manager, t.id, NOW);
    expect(asMgr.updates.map((u) => u.body)).toEqual(['mới', 'cũ']);
    expect(asMgr).toMatchObject({ canReview: true, canConfirm: false, canEdit: false });
    expect(asMgr.lastActivityAt).toEqual(new Date('2026-11-25T00:00:00Z'));
    expect(asMgr.planHistory[0]).toMatchObject({ version: 1, kind: 'initial' });
    const asOwner = await taskDetail(testDb, leader, t.id, NOW);
    expect(asOwner).toMatchObject({ canReview: false, canEdit: true });
    await expect(taskDetail(testDb, director, t.id, NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const p = await makeTask(leader.id, { isPrivate: true });
    await expect(taskDetail(testDb, manager, p.id, NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('exposes only a public owner projection and hides repoRef/cwdHint from the manager', async () => {
    const { leader, manager } = await chain();
    const t = await makeTask(leader.id, {
      status: 'in_progress', repoRef: { repo: 'r', branch: 'b' }, cwdHint: '/x',
    });
    const asMgr = await taskDetail(testDb, manager, t.id, NOW);
    expect(Object.keys(asMgr.owner).sort()).toEqual(['avatarUrl', 'displayName', 'id', 'level', 'managerId']);
    expect(asMgr.task.repoRef).toBeNull();
    expect(asMgr.task.cwdHint).toBeNull();
    const asOwner = await taskDetail(testDb, leader, t.id, NOW);
    expect(asOwner.task.repoRef).toEqual({ repo: 'r', branch: 'b' });
    expect(asOwner.task.cwdHint).toBe('/x');
  });
  it('personTimeline returns a public person projection', async () => {
    const { leader, manager } = await chain();
    const r = await personTimeline(testDb, manager, leader.id, NOW);
    expect(Object.keys(r.person).sort()).toEqual(['avatarUrl', 'displayName', 'id', 'level', 'managerId']);
  });
  it('canConfirm for pending_confirmation', async () => {
    const { leader, manager } = await chain();
    const t = await makeTask(leader.id, { status: 'pending_confirmation' });
    expect((await taskDetail(testDb, manager, t.id, NOW)).canConfirm).toBe(true);
  });
});

describe('weeklyDigest', () => {
  it('skips private tasks and summarises the last 7 days', async () => {
    const { leader, manager } = await chain();
    await makeTask(leader.id, { status: 'done', title: 'Xong', completedAt: new Date('2026-11-24T00:00:00Z') });
    await makeTask(leader.id, { status: 'done', title: 'Riêng xong', isPrivate: true, completedAt: new Date('2026-11-24T00:00:00Z') });
    await makeTask(leader.id, { status: 'in_progress', title: 'Mới bắt đầu', createdAt: new Date('2026-11-24T00:00:00Z') });
    const b = await makeTask(leader.id, { status: 'in_progress', title: 'Kẹt', createdAt: new Date('2026-10-01T00:00:00Z') });
    await testDb.insert(questions).values({ taskId: b.id, authorId: leader.id, direction: 'member_to_manager', body: 'cần quyền', isBlocker: true });
    const s = await makeTask(leader.id, { status: 'in_progress', title: 'Trễ', createdAt: new Date('2026-10-01T00:00:00Z'), agreedDueDate: '2026-12-01', expectedEndDate: '2026-12-01' });
    await testDb.update(tasks).set({ expectedEndDate: '2026-12-10' }).where(eq(tasks.id, s.id));
    await testDb.insert(planVersions).values({ taskId: s.id, version: 2, kind: 'revision', reason: 'dời hạn', steps: [], createdAt: new Date('2026-11-24T00:00:00Z') });
    const d = await weeklyDigest(testDb, manager, NOW);
    expect(d.people).toHaveLength(1);
    const p = d.people[0];
    expect(p.completed.map((x) => x.title)).toEqual(['Xong']);
    expect(p.started.map((x) => x.title)).toContain('Mới bắt đầu');
    expect(p.blocked).toEqual([{ title: 'Kẹt', detail: 'cần quyền' }]);
    expect(p.slipped).toEqual([{ title: 'Trễ', from: '2026-12-01', to: '2026-12-10' }]);
    const all = JSON.stringify(d);
    expect(all).not.toContain('Riêng');
  });
});

describe('listMyTasks', () => {
  it('lists only own active tasks by default, done ones with includeDone', async () => {
    const me = await makeUser();
    const other = await makeUser();
    const active = await makeTask(me.id, { title: 'Đang làm', status: 'in_progress' });
    const done = await makeTask(me.id, { title: 'Đã xong', status: 'done', completedAt: NOW });
    await makeTask(other.id, { title: 'Của người khác' });
    const def = await listMyTasks(testDb, me, {}, NOW);
    expect(def.map((t) => t.id)).toEqual([active.id]);
    expect(def[0]).toMatchObject({ title: 'Đang làm', status: 'in_progress', progress: 0, startDate: '2026-11-23', agreedDueDate: '2026-11-30' });
    expect(def[0].health).toBeTruthy();
    const all = await listMyTasks(testDb, me, { includeDone: true }, NOW);
    expect(all.map((t) => t.id).sort()).toEqual([active.id, done.id].sort());
  });

  it('includes repoRef and cwdHint for the owner\'s tasks', async () => {
    const me = await makeUser();
    await makeTask(me.id, { status: 'in_progress', repoRef: { branch: 'feat/x' }, cwdHint: '/work/x' });
    const [t] = await listMyTasks(testDb, me, {}, NOW);
    expect(t.repoRef).toEqual({ branch: 'feat/x' });
    expect(t.cwdHint).toBe('/work/x');
  });
});
