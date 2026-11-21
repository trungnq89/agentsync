import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  managerFeedback, planVersions, questions, reviews, solutionSummaries, tasks, updates, users,
  type Task,
} from '@/db/schema';
import { isCurrentManagerOf, loadTaskForViewer, type Actor } from '@/server/authz';
import { isValidIsoDate, isWithinHours } from '@/server/clock';
import { DomainError } from '@/server/errors';
import { isUuid } from '@/server/ids';
import { nextStatus, TERMINAL_STATUSES } from './lifecycle';
import { asDb, currentPlan, lifecycleCtx, requireOwner, type Tx } from './internal';

export type Update = typeof updates.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type SolutionSummary = typeof solutionSummaries.$inferSelect;


export interface PostUpdateInput {
  body: string;
  stepsCompleted?: string[];
  progressPct?: number;
  expectedEndDate?: string;
  source: 'auto' | 'reviewed';
  evidence?: { branch?: string; commits?: number; prUrl?: string };
}

export async function postUpdate(
  db: Db,
  actor: Actor,
  taskId: string,
  input: PostUpdateInput,
  now: Date = new Date(),
): Promise<Update> {
  if (!input.body.trim()) throw new DomainError('VALIDATION', 'updateBodyRequired');
  if (input.progressPct !== undefined && (!Number.isInteger(input.progressPct) || input.progressPct < 0 || input.progressPct > 100)) {
    throw new DomainError('VALIDATION', 'progressRange');
  }
  if (input.expectedEndDate !== undefined && !isValidIsoDate(input.expectedEndDate)) {
    throw new DomainError('VALIDATION', 'invalidDate');
  }
  return db.transaction(async (tx) => {
    let task: Task;
    try {
      ({ task } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true }));
    } catch (e) {
      if (e instanceof DomainError && e.code === 'NOT_FOUND') throw new DomainError('NOT_FOUND', 'notFoundTaskOrNotOwner');
      throw e;
    }
    if (actor.id !== task.ownerId) throw new DomainError('NOT_FOUND', 'notFoundTaskOrNotOwner');
    if (TERMINAL_STATUSES.includes(task.status)) {
      throw new DomainError('INVALID_TRANSITION', 'taskClosed');
    }
    const done = input.stepsCompleted ?? [];
    if (done.length > 0) {
      const plan = await currentPlan(tx, taskId);
      const unknown = done.filter((t) => !plan.steps.some((s) => s.title === t));
      if (unknown.length > 0) {
        throw new DomainError('VALIDATION', 'unknownSteps', { steps: unknown.join(', ') });
      }
      const steps = plan.steps.map((s) => (done.includes(s.title) ? { ...s, status: 'done' as const } : s));
      await tx.update(planVersions).set({ steps }).where(eq(planVersions.id, plan.id));
    }
    const [row] = await tx
      .insert(updates)
      .values({
        taskId, authorId: actor.id, body: input.body, stepsCompleted: done,
        source: input.source, evidence: input.evidence, createdAt: now,
      })
      .returning();
    if (input.progressPct !== undefined || input.expectedEndDate) {
      await tx
        .update(tasks)
        .set({
          ...(input.progressPct !== undefined ? { progressOverride: input.progressPct } : {}),
          ...(input.expectedEndDate ? { expectedEndDate: input.expectedEndDate } : {}),
        })
        .where(eq(tasks.id, taskId));
    }
    return row;
  });
}

const notFound = (what: 'update' | 'question') =>
  new DomainError('NOT_FOUND', what === 'update' ? 'notFoundUpdate' : 'notFoundQuestion');

function assertEditable(row: { authorId: string; createdAt: Date }, actor: Actor, now: Date) {
  if (row.authorId !== actor.id) throw new DomainError('FORBIDDEN', 'authorOnlyEdit');
  if (!isWithinHours(row.createdAt, now, 24)) {
    throw new DomainError('EDIT_WINDOW_CLOSED', 'editWindowClosed');
  }
}

export async function editUpdate(db: Db, actor: Actor, updateId: string, body: string, now: Date = new Date()): Promise<Update> {
  if (!isUuid(updateId)) throw notFound('update');
  if (!body.trim()) throw new DomainError('VALIDATION', 'bodyRequired');
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(updates).where(eq(updates.id, updateId));
    if (!row) throw notFound('update');
    await loadTaskForViewer(asDb(tx), actor, row.taskId, { forUpdate: true });
    assertEditable(row, actor, now);
    const [updated] = await tx.update(updates).set({ body, editedAt: now }).where(eq(updates.id, updateId)).returning();
    return updated;
  });
}

export async function editQuestion(db: Db, actor: Actor, questionId: string, body: string, now: Date = new Date()): Promise<Question> {
  if (!isUuid(questionId)) throw notFound('question');
  if (!body.trim()) throw new DomainError('VALIDATION', 'bodyRequired');
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(questions).where(eq(questions.id, questionId));
    if (!row) throw notFound('question');
    await loadTaskForViewer(asDb(tx), actor, row.taskId, { forUpdate: true });
    assertEditable(row, actor, now);
    const [updated] = await tx.update(questions).set({ body, editedAt: now }).where(eq(questions.id, questionId)).returning();
    return updated;
  });
}

export async function deleteUpdate(db: Db, actor: Actor, updateId: string): Promise<void> {
  if (!isUuid(updateId)) throw notFound('update');
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(updates).where(eq(updates.id, updateId));
    if (!row) throw notFound('update');
    const { task } = await loadTaskForViewer(asDb(tx), actor, row.taskId, { forUpdate: true });
    if (!task.isPrivate) throw new DomainError('FORBIDDEN', 'privateOnlyDelete');
    if (row.authorId !== actor.id) throw new DomainError('FORBIDDEN', 'authorOnlyDelete');
    await tx.delete(updates).where(eq(updates.id, updateId));
  });
}

export async function askQuestion(
  db: Db,
  actor: Actor,
  taskId: string,
  body: string,
  opts: { isBlocker: boolean },
  now: Date = new Date(),
): Promise<Question> {
  if (!body.trim()) throw new DomainError('VALIDATION', 'questionBodyRequired');
  return db.transaction(async (tx) => {
    const { task } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    if (TERMINAL_STATUSES.includes(task.status)) throw new DomainError('INVALID_TRANSITION', 'taskClosed');
    const isOwner = actor.id === task.ownerId;
    const [row] = await tx
      .insert(questions)
      .values({
        taskId, authorId: actor.id, body, createdAt: now,
        direction: isOwner ? 'member_to_manager' : 'manager_to_member',
        isBlocker: isOwner ? opts.isBlocker : false,
      })
      .returning();
    return row;
  });
}

async function loadQuestion(tx: Tx, actor: Actor, questionId: string) {
  if (!isUuid(questionId)) throw notFound('question');
  const [q] = await tx.select().from(questions).where(eq(questions.id, questionId));
  if (!q) throw notFound('question');
  const { task, owner } = await loadTaskForViewer(asDb(tx), actor, q.taskId, { forUpdate: true });
  // Re-read under the task lock.
  const [fresh] = await tx.select().from(questions).where(eq(questions.id, questionId));
  return { q: fresh, task, owner };
}

export async function answerQuestion(
  db: Db,
  actor: Actor,
  questionId: string,
  answer: string,
  now: Date = new Date(),
): Promise<Question> {
  if (!answer.trim()) throw new DomainError('VALIDATION', 'answerRequired');
  return db.transaction(async (tx) => {
    const { q, task, owner } = await loadQuestion(tx, actor, questionId);
    const allowed = q.direction === 'manager_to_member'
      ? actor.id === task.ownerId
      : isCurrentManagerOf(actor, owner) && actor.id !== task.ownerId;
    if (!allowed) throw new DomainError('FORBIDDEN', 'onlyOtherSideAnswers');
    if (q.status === 'resolved') throw new DomainError('INVALID_TRANSITION', 'questionResolved');
    const [row] = await tx
      .update(questions)
      .set({ status: 'answered', answer, answeredById: actor.id, answeredAt: now })
      .where(eq(questions.id, questionId))
      .returning();
    return row;
  });
}

export async function resolveQuestion(db: Db, actor: Actor, questionId: string): Promise<Question> {
  return db.transaction(async (tx) => {
    const { q } = await loadQuestion(tx, actor, questionId);
    if (q.authorId !== actor.id) throw new DomainError('FORBIDDEN', 'onlyAskerResolves');
    const [row] = await tx
      .update(questions)
      .set({ status: 'resolved' })
      .where(eq(questions.id, questionId))
      .returning();
    return row;
  });
}

export interface SolutionSummaryInput {
  problem: string;
  solution: string;
  rejectedAlternatives: string;
  keyChanges: string;
  risks: string;
  testing: string;
  prUrl?: string;
}

export async function submitSolutionSummary(
  db: Db,
  actor: Actor,
  taskId: string,
  input: SolutionSummaryInput,
  now: Date = new Date(),
): Promise<SolutionSummary> {
  return db.transaction(async (tx) => {
    const { task } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    requireOwner(actor, task);
    if (TERMINAL_STATUSES.includes(task.status)) throw new DomainError('INVALID_TRANSITION', 'taskClosed');
    if (task.mode !== 'project') {
      throw new DomainError('VALIDATION', 'summaryProjectOnly');
    }
    const [row] = await tx
      .insert(solutionSummaries)
      .values({ taskId, ...input, createdAt: now })
      .onConflictDoUpdate({
        target: solutionSummaries.taskId,
        set: { ...input, prUrl: input.prUrl ?? null },
      })
      .returning();
    return row;
  });
}

export async function reviewSolution(
  db: Db,
  actor: Actor,
  taskId: string,
  verdict: 'approved' | 'changes_needed',
  note?: string,
  now: Date = new Date(),
): Promise<Task> {
  if (verdict === 'changes_needed' && !note?.trim()) {
    throw new DomainError('VALIDATION', 'noteRequiredForChanges');
  }
  return db.transaction(async (tx) => {
    const { task, owner } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    const role = isCurrentManagerOf(actor, owner) && actor.id !== task.ownerId ? 'manager' : 'owner';
    const to = nextStatus(
      lifecycleCtx(task, owner.managerId),
      verdict === 'approved' ? 'approve_review' : 'reject_review',
      role,
    );
    await tx.insert(reviews).values({
      taskId, reviewerId: actor.id, verdict, note: note?.trim() || null, createdAt: now,
    });
    const [updated] = await tx
      .update(tasks)
      .set({ status: to, statusChangedAt: now, ...(to === 'in_progress' ? { completedAt: null } : {}) })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  });
}

export interface PendingFeedback {
  changesRequested: { taskId: string; title: string; note: string }[];
  questionsForMe: { questionId: string; taskId: string; title: string; body: string }[];
  answersToMyQuestions: { questionId: string; taskId: string; title: string; body: string; answer: string }[];
  reviewResults: { taskId: string; title: string; verdict: 'approved' | 'changes_needed'; note: string | null }[];
}

export async function getPendingFeedback(db: Db, actor: Actor): Promise<PendingFeedback> {
  const changesRequested = await db
    .select({ taskId: tasks.id, title: tasks.title, note: managerFeedback.note })
    .from(managerFeedback)
    .innerJoin(tasks, eq(tasks.id, managerFeedback.taskId))
    .where(and(eq(tasks.ownerId, actor.id), eq(tasks.status, 'changes_requested'), isNull(managerFeedback.consumedAt)))
    .orderBy(managerFeedback.createdAt);

  const questionsForMe = await db
    .select({ questionId: questions.id, taskId: tasks.id, title: tasks.title, body: questions.body })
    .from(questions)
    .innerJoin(tasks, eq(tasks.id, questions.taskId))
    .where(and(
      eq(tasks.ownerId, actor.id),
      eq(questions.direction, 'manager_to_member'),
      eq(questions.status, 'open'),
    ))
    .orderBy(questions.createdAt);

  // Only answers on tasks the actor can still see (owner, or current manager of a public task).
  const answered = await db
    .select({
      questionId: questions.id, taskId: tasks.id, title: tasks.title, body: questions.body,
      answer: questions.answer, ownerId: tasks.ownerId, isPrivate: tasks.isPrivate, ownerManagerId: users.managerId,
    })
    .from(questions)
    .innerJoin(tasks, eq(tasks.id, questions.taskId))
    .innerJoin(users, eq(users.id, tasks.ownerId))
    .where(and(eq(questions.authorId, actor.id), eq(questions.status, 'answered')))
    .orderBy(questions.createdAt);
  const answersToMyQuestions = answered
    .filter((r) => r.ownerId === actor.id || (!r.isPrivate && r.ownerManagerId === actor.id))
    .map((r) => ({ questionId: r.questionId, taskId: r.taskId, title: r.title, body: r.body, answer: r.answer ?? '' }));

  const reviewRows = await db
    .select({ taskId: tasks.id, title: tasks.title, verdict: reviews.verdict, note: reviews.note })
    .from(reviews)
    .innerJoin(tasks, eq(tasks.id, reviews.taskId))
    .where(and(eq(tasks.ownerId, actor.id), inArray(tasks.status, ['in_progress'])))
    .orderBy(desc(reviews.createdAt));
  const seen = new Set<string>();
  const reviewResults: PendingFeedback['reviewResults'] = [];
  for (const r of reviewRows) {
    if (seen.has(r.taskId)) continue;
    seen.add(r.taskId);
    if (r.verdict === 'changes_needed') reviewResults.push(r);
  }

  return { changesRequested, questionsForMe, answersToMyQuestions, reviewResults };
}
