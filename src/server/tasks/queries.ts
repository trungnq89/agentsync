import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  appSettings, planVersions, questions, reviews, solutionSummaries, tasks, updates, users,
  type Task, type User,
} from '@/db/schema';
import { canViewUser, isCurrentManagerOf, loadTaskForViewer, type Actor } from '@/server/authz';
import { DomainError } from '@/server/errors';
import { isUuid } from '@/server/ids';
import { listDirectReports } from '@/server/org';
import { computeHealth, progressPct, type Health } from './health';
import { currentPlan, type PlanVersion } from './internal';
import { ACTIVE_STATUSES, DONE_STATUSES } from './lifecycle';
import { getPendingFeedback } from './activity';

const DAY_MS = 24 * 60 * 60 * 1000;
const LEVEL_ORDER = ['director', 'manager', 'leader', 'member'] as const;
type Level = (typeof LEVEL_ORDER)[number];

interface Metrics {
  plan: PlanVersion | undefined;
  progress: number;
  lastActivityAt: Date;
  planChangedAt: Date | undefined;
  blocker: { body: string; createdAt: Date } | undefined;
  health: Health;
  overdue: boolean;
  stale: boolean;
}

async function staleDays(db: Db): Promise<number> {
  const [s] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return s?.staleBusinessDays ?? 3;
}

/** One query per kind of data for the whole list of tasks. */
async function loadMetrics(db: Db, rows: Task[], now: Date): Promise<Map<string, Metrics>> {
  const out = new Map<string, Metrics>();
  if (rows.length === 0) return out;
  const ids = rows.map((t) => t.id);
  const [days, plans, lastUpdates, blockers] = await Promise.all([
    staleDays(db),
    db.select().from(planVersions).where(inArray(planVersions.taskId, ids)).orderBy(asc(planVersions.version)),
    db
      .select({ taskId: updates.taskId, at: max(updates.createdAt) })
      .from(updates)
      .where(inArray(updates.taskId, ids))
      .groupBy(updates.taskId),
    db
      .select({ taskId: questions.taskId, body: questions.body, createdAt: questions.createdAt })
      .from(questions)
      .where(and(
        inArray(questions.taskId, ids),
        eq(questions.isBlocker, true),
        eq(questions.direction, 'member_to_manager'),
        eq(questions.status, 'open'),
      ))
      .orderBy(desc(questions.createdAt)),
  ]);
  const planBy = new Map<string, PlanVersion>();
  for (const p of plans) planBy.set(p.taskId, p); // ascending → last wins
  const updBy = new Map(lastUpdates.map((u) => [u.taskId, u.at]));
  const blockBy = new Map<string, { body: string; createdAt: Date }>();
  for (const b of blockers) if (!blockBy.has(b.taskId)) blockBy.set(b.taskId, b);

  for (const t of rows) {
    const plan = planBy.get(t.id);
    const lastActivityAt = new Date(Math.max(
      t.createdAt.getTime(), t.statusChangedAt.getTime(), updBy.get(t.id)?.getTime() ?? 0,
    ));
    const blocker = blockBy.get(t.id);
    const h = computeHealth({
      status: t.status, agreedDueDate: t.agreedDueDate, expectedEndDate: t.expectedEndDate,
      lastActivityAt, hasOpenBlocker: !!blocker, staleBusinessDays: days, now,
    });
    out.set(t.id, {
      plan, lastActivityAt, blocker, ...h,
      planChangedAt: plan?.createdAt,
      progress: plan ? progressPct(plan, t.progressOverride) : (t.progressOverride ?? 0),
    });
  }
  return out;
}

const tasksOf = (db: Db, ownerIds: string[]) =>
  ownerIds.length === 0 ? Promise.resolve([] as Task[]) : db.select().from(tasks).where(inArray(tasks.ownerId, ownerIds));

const isActive = (t: Task) => ACTIVE_STATUSES.includes(t.status);
const isDoneWithin = (t: Task, now: Date, ms: number) =>
  DONE_STATUSES.includes(t.status) && !!t.completedAt && t.completedAt.getTime() >= now.getTime() - ms;

// ---------------------------------------------------------------- teamOverview

export interface PersonCard {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  doneCount30d: number;
  activeCount: number;
  hasBlocked: boolean;
  hasAwaitingReview: boolean;
  lastActivityAt: Date | null;
}

export async function teamOverview(
  db: Db,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ tiers: { level: Level; people: PersonCard[] }[] }> {
  const [self] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!self) throw new DomainError('NOT_FOUND', 'Không tìm thấy người dùng.');
  const people = [self, ...(await listDirectReports(db, actor.id))];
  const rows = (await tasksOf(db, people.map((p) => p.id))).filter((t) => !t.isPrivate || t.ownerId === actor.id);
  const metrics = await loadMetrics(db, rows, now);

  const cards = people.map((p): PersonCard & { level: Level } => {
    const mine = rows.filter((t) => t.ownerId === p.id);
    const active = mine.filter(isActive);
    const times = mine.map((t) => metrics.get(t.id)!.lastActivityAt.getTime());
    return {
      level: p.level,
      userId: p.id,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      doneCount30d: mine.filter((t) => isDoneWithin(t, now, 30 * DAY_MS)).length,
      activeCount: active.length,
      hasBlocked: active.some((t) => metrics.get(t.id)!.blocker),
      hasAwaitingReview: mine.some((t) => t.status === 'awaiting_review'),
      lastActivityAt: times.length ? new Date(Math.max(...times)) : null,
    };
  });
  const tiers = LEVEL_ORDER.map((level) => ({
    level,
    people: cards
      .filter((c) => c.level === level)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map(({ level: _l, ...c }) => c),
  })).filter((t) => t.people.length > 0);
  return { tiers };
}

// ---------------------------------------------------------------- needsAttention

export type AttentionKind =
  | 'pending_confirmation' | 'awaiting_review' | 'blocked' | 'overdue' | 'stale'
  | 'paused_or_cancelled' | 'changes_requested' | 'question_for_me';
const KIND_ORDER: AttentionKind[] = [
  'pending_confirmation', 'awaiting_review', 'blocked', 'overdue', 'stale',
  'paused_or_cancelled', 'changes_requested', 'question_for_me',
];

export interface AttentionItem {
  kind: AttentionKind;
  taskId: string;
  taskTitle: string;
  ownerName: string;
  detail: string;
  at: Date;
}

export async function needsAttention(db: Db, actor: Actor, now: Date = new Date()): Promise<AttentionItem[]> {
  const reports = await listDirectReports(db, actor.id);
  const nameBy = new Map(reports.map((r) => [r.id, r.displayName]));
  const rows = (await tasksOf(db, reports.map((r) => r.id))).filter((t) => !t.isPrivate);
  const metrics = await loadMetrics(db, rows, now);
  const items: AttentionItem[] = [];
  const push = (kind: AttentionKind, t: Task, ownerName: string, detail: string, at: Date) =>
    items.push({ kind, taskId: t.id, taskTitle: t.title, ownerName, detail, at });

  for (const t of rows) {
    const m = metrics.get(t.id)!;
    const owner = nameBy.get(t.ownerId)!;
    if (t.status === 'pending_confirmation') push('pending_confirmation', t, owner, 'Chờ bạn xác nhận plan.', t.statusChangedAt);
    if (t.status === 'awaiting_review') push('awaiting_review', t, owner, 'Chờ bạn review giải pháp.', t.statusChangedAt);
    if (isActive(t) && m.blocker) push('blocked', t, owner, m.blocker.body, m.blocker.createdAt);
    if (isActive(t) && m.overdue) {
      push('overdue', t, owner, `Hạn thống nhất ${t.agreedDueDate}, dự kiến ${t.expectedEndDate}.`, m.lastActivityAt);
    }
    if (m.stale) push('stale', t, owner, 'Lâu không có cập nhật.', m.lastActivityAt);
    if (
      (t.status === 'paused' || t.status === 'cancelled') &&
      t.statusChangedAt.getTime() >= now.getTime() - 7 * DAY_MS
    ) {
      push('paused_or_cancelled', t, owner, t.statusReason ?? (t.status === 'paused' ? 'Tạm dừng.' : 'Đã hủy.'), t.statusChangedAt);
    }
  }

  // Actor's own tasks: reuse the owner-side feedback computation.
  const fb = await getPendingFeedback(db, actor);
  const ownIds = [...new Set([...fb.changesRequested, ...fb.questionsForMe].map((x) => x.taskId))];
  if (ownIds.length > 0) {
    const own = new Map((await db.select().from(tasks).where(inArray(tasks.id, ownIds))).map((t) => [t.id, t]));
    const qIds = fb.questionsForMe.map((q) => q.questionId);
    const qAt = new Map(
      qIds.length
        ? (await db.select({ id: questions.id, at: questions.createdAt }).from(questions).where(inArray(questions.id, qIds))).map((q) => [q.id, q.at])
        : [],
    );
    for (const c of fb.changesRequested) {
      const t = own.get(c.taskId)!;
      push('changes_requested', t, 'Bạn', c.note, t.statusChangedAt);
    }
    for (const q of fb.questionsForMe) {
      push('question_for_me', own.get(q.taskId)!, 'Bạn', q.body, qAt.get(q.questionId) ?? now);
    }
  }

  return items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.at.getTime() - a.at.getTime());
}

// ---------------------------------------------------------------- personTimeline

export interface TimelineTask {
  id: string;
  title: string;
  status: Task['status'];
  startDate: string;
  agreedDueDate: string;
  expectedEndDate: string;
  progress: number;
  health: Health;
}

export async function personTimeline(
  db: Db,
  actor: Actor,
  userId: string,
  now: Date = new Date(),
): Promise<{ person: User; tasks: TimelineTask[] }> {
  const notFound = () => new DomainError('NOT_FOUND', 'Không tìm thấy người này.');
  if (!isUuid(userId)) throw notFound();
  const [person] = await db.select().from(users).where(eq(users.id, userId));
  if (!person || !canViewUser(actor, person)) throw notFound();
  const rows = (await tasksOf(db, [userId]))
    .filter((t) => (!t.isPrivate || t.ownerId === actor.id) && (isActive(t) || isDoneWithin(t, now, 30 * DAY_MS)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const metrics = await loadMetrics(db, rows, now);
  return {
    person,
    tasks: rows.map((t) => ({
      id: t.id, title: t.title, status: t.status, startDate: t.startDate,
      agreedDueDate: t.agreedDueDate, expectedEndDate: t.expectedEndDate,
      progress: metrics.get(t.id)!.progress, health: metrics.get(t.id)!.health,
    })),
  };
}

// ---------------------------------------------------------------- taskDetail

export async function taskDetail(db: Db, actor: Actor, taskId: string, now: Date = new Date()) {
  const { task, owner } = await loadTaskForViewer(db, actor, taskId);
  const [plan, planRows, updateRows, questionRows, [solution], [latestReview], metrics] = await Promise.all([
    currentPlan(db, taskId),
    db.select().from(planVersions).where(eq(planVersions.taskId, taskId)).orderBy(asc(planVersions.version)),
    db.select().from(updates).where(eq(updates.taskId, taskId)).orderBy(desc(updates.createdAt)),
    db.select().from(questions).where(eq(questions.taskId, taskId)).orderBy(asc(questions.createdAt)),
    db.select().from(solutionSummaries).where(eq(solutionSummaries.taskId, taskId)),
    db.select().from(reviews).where(eq(reviews.taskId, taskId)).orderBy(desc(reviews.createdAt)).limit(1),
    loadMetrics(db, [task], now),
  ]);
  const m = metrics.get(task.id)!;
  const isMgr = isCurrentManagerOf(actor, owner) && actor.id !== task.ownerId;
  return {
    task,
    owner,
    plan,
    progress: m.progress,
    lastActivityAt: m.lastActivityAt,
    health: { health: m.health, overdue: m.overdue, stale: m.stale },
    updates: updateRows,
    questions: questionRows,
    solution,
    latestReview,
    planHistory: planRows.map((p) => ({ version: p.version, kind: p.kind, reason: p.reason, createdAt: p.createdAt })),
    canConfirm: isMgr && task.status === 'pending_confirmation',
    canReview: isMgr && task.status === 'awaiting_review',
    canEdit: actor.id === task.ownerId,
  };
}

// ---------------------------------------------------------------- weeklyDigest

export interface DigestPerson {
  displayName: string;
  completed: { title: string }[];
  started: { title: string }[];
  blocked: { title: string; detail: string }[];
  slipped: { title: string; from: string; to: string }[];
}

export async function weeklyDigest(db: Db, actor: Actor, now: Date = new Date()): Promise<{ people: DigestPerson[] }> {
  const since = now.getTime() - 7 * DAY_MS;
  const reports = await listDirectReports(db, actor.id);
  const rows = (await tasksOf(db, reports.map((r) => r.id))).filter((t) => !t.isPrivate);
  const metrics = await loadMetrics(db, rows, now);
  const people: DigestPerson[] = [];
  for (const r of reports) {
    const mine = rows.filter((t) => t.ownerId === r.id);
    const p: DigestPerson = {
      displayName: r.displayName,
      completed: mine.filter((t) => isDoneWithin(t, now, 7 * DAY_MS)).map((t) => ({ title: t.title })),
      started: mine.filter((t) => t.createdAt.getTime() >= since).map((t) => ({ title: t.title })),
      blocked: mine.filter((t) => isActive(t) && metrics.get(t.id)!.blocker)
        .map((t) => ({ title: t.title, detail: metrics.get(t.id)!.blocker!.body })),
      slipped: mine
        .filter((t) => {
          const m = metrics.get(t.id)!;
          const touched = Math.max(m.lastActivityAt.getTime(), m.planChangedAt?.getTime() ?? 0);
          return isActive(t) && t.expectedEndDate > t.agreedDueDate && touched >= since;
        })
        .map((t) => ({ title: t.title, from: t.agreedDueDate, to: t.expectedEndDate })),
    };
    if (p.completed.length || p.started.length || p.blocked.length || p.slipped.length) people.push(p);
  }
  return { people };
}

// ---------------------------------------------------------------- listMyTasks

export async function listMyTasks(
  db: Db,
  actor: Actor,
  opts: { includeDone?: boolean } = {},
  now: Date = new Date(),
): Promise<TimelineTask[]> {
  const rows = (await tasksOf(db, [actor.id]))
    .filter((t) => isActive(t) || (opts.includeDone && (DONE_STATUSES.includes(t.status) || t.status === 'cancelled')))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const metrics = await loadMetrics(db, rows, now);
  return rows.map((t) => ({
    id: t.id, title: t.title, status: t.status, startDate: t.startDate,
    agreedDueDate: t.agreedDueDate, expectedEndDate: t.expectedEndDate,
    progress: metrics.get(t.id)!.progress, health: metrics.get(t.id)!.health,
  }));
}
