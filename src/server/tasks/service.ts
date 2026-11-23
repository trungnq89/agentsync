import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  managerFeedback, planVersions, solutionSummaries, tasks, users,
  type PlanStep, type Task,
} from '@/db/schema';
import { isCurrentManagerOf, loadTaskForViewer, type Actor } from '@/server/authz';
import { isValidIsoDate, isWithinHours } from '@/server/clock';
import { DomainError } from '@/server/errors';
import { assertUniqueStepTitles, normalizePlanSteps } from './confirm';
import { asDb, currentPlan, lifecycleCtx, requireOwner, type PlanVersion } from './internal';
import { initialStatus, nextStatus, TERMINAL_STATUSES, type TaskAction, type TaskStatus } from './lifecycle';

export type { PlanVersion };;

export interface CreateTaskInput {
  title: string;
  mode: Task['mode'];
  agreedOutcome: string;
  startDate: string; // YYYY-MM-DD
  agreedDueDate: string; // YYYY-MM-DD
  steps: string[];
  isPrivate?: boolean;
  repoRef?: { repo?: string; branch?: string };
  cwdHint?: string;
}

export function getCurrentPlan(db: Db, taskId: string): Promise<PlanVersion> {
  return currentPlan(db, taskId);
}

export async function createTask(
  db: Db,
  actor: Actor,
  input: CreateTaskInput,
  now: Date = new Date(),
): Promise<Task> {
  if (!isValidIsoDate(input.startDate) || !isValidIsoDate(input.agreedDueDate)) {
    throw new DomainError('VALIDATION', 'invalidDate');
  }
  if (input.steps.length === 0) throw new DomainError('VALIDATION', 'planNeedsStep');
  assertUniqueStepTitles(input.steps);
  if (input.agreedDueDate < input.startDate) {
    throw new DomainError('VALIDATION', 'dueBeforeStart');
  }
  return db.transaction(async (tx) => {
    const [owner] = await tx.select().from(users).where(eq(users.id, actor.id));
    if (!owner) throw new DomainError('NOT_FOUND', 'notFoundUser');
    const isPrivate = input.isPrivate ?? false;
    const status = initialStatus({ hasManager: owner.managerId !== null, isPrivate });
    const [task] = await tx
      .insert(tasks)
      .values({
        ownerId: owner.id,
        confirmerIdAtCreation: owner.managerId,
        title: input.title,
        mode: input.mode,
        status,
        isPrivate,
        agreedOutcome: input.agreedOutcome,
        startDate: input.startDate,
        agreedDueDate: input.agreedDueDate,
        expectedEndDate: input.agreedDueDate,
        repoRef: input.repoRef,
        cwdHint: input.cwdHint,
        createdAt: now,
        statusChangedAt: now,
      })
      .returning();
    await tx.insert(planVersions).values({
      taskId: task.id,
      version: 1,
      kind: 'initial',
      steps: input.steps.map((title) => ({ title, status: 'todo' as const })),
      createdAt: now,
    });
    return task;
  });
}

async function managerAction(
  db: Db,
  actor: Actor,
  taskId: string,
  action: 'confirm' | 'request_changes',
  now: Date,
  note?: string,
): Promise<Task> {
  return db.transaction(async (tx) => {
    const { task, owner } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    const role = isCurrentManagerOf(actor, owner) && actor.id !== task.ownerId ? 'manager' : 'owner';
    const to = nextStatus(lifecycleCtx(task, owner.managerId), action, role);
    if (action === 'request_changes') {
      await tx.insert(managerFeedback).values({
        taskId, authorId: actor.id, kind: 'changes_requested', note: note ?? '', createdAt: now,
      });
    }
    const [updated] = await tx
      .update(tasks)
      .set({
        status: to,
        statusChangedAt: now,
        ...(action === 'confirm' ? { confirmedAt: now } : {}),
      })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  });
}

export function confirmTask(db: Db, actor: Actor, taskId: string, now: Date = new Date()): Promise<Task> {
  return managerAction(db, actor, taskId, 'confirm', now);
}

export function requestChanges(
  db: Db,
  actor: Actor,
  taskId: string,
  note: string,
  now: Date = new Date(),
): Promise<Task> {
  if (!note.trim()) throw new DomainError('VALIDATION', 'noteRequiredForChanges', { field: 'note' });
  return managerAction(db, actor, taskId, 'request_changes', now, note);
}

export async function changePlan(
  db: Db,
  actor: Actor,
  taskId: string,
  input: { steps: PlanStep[]; reason?: string; expectedEndDate?: string },
  now: Date = new Date(),
): Promise<Task> {
  if (input.steps.length === 0) throw new DomainError('VALIDATION', 'planNeedsStep');
  assertUniqueStepTitles(input.steps.map((x) => x.title));
  if (input.expectedEndDate !== undefined && !isValidIsoDate(input.expectedEndDate)) {
    throw new DomainError('VALIDATION', 'invalidDate');
  }
  return db.transaction(async (tx) => {
    const { task, owner } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    requireOwner(actor, task);
    if (TERMINAL_STATUSES.includes(task.status)) {
      throw new DomainError('INVALID_TRANSITION', 'planEditBlocked', { status: task.status });
    }
    const current = await currentPlan(tx, taskId);
    const reason = input.reason?.trim() || null;

    let kind: PlanVersion['kind'];
    let nextState: TaskStatus | null = null;
    if (task.status === 'changes_requested') {
      kind = 'revision';
      nextState = nextStatus(lifecycleCtx(task, owner.managerId), 'resubmit', 'owner');
    } else if (task.mode === 'executive' || isWithinHours(current.createdAt, now, 24)) {
      kind = 'edit';
    } else {
      if (!reason) {
        throw new DomainError('EDIT_WINDOW_CLOSED', 'planLocked');
      }
      kind = 'revision';
    }

    try {
      await tx.insert(planVersions).values({
        taskId, version: current.version + 1, kind, reason, steps: normalizePlanSteps(input.steps, current.steps), createdAt: now,
      });
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } });
      if (code.code === '23505' || code.cause?.code === '23505') {
        throw new DomainError('INVALID_TRANSITION', 'taskModified');
      }
      throw e;
    }
    if (nextState) {
      await tx
        .update(managerFeedback)
        .set({ consumedAt: now })
        .where(and(eq(managerFeedback.taskId, taskId), isNull(managerFeedback.consumedAt)));
    }
    if (!input.expectedEndDate && !nextState) return task;
    const [updated] = await tx
      .update(tasks)
      .set({
        ...(input.expectedEndDate ? { expectedEndDate: input.expectedEndDate } : {}),
        ...(nextState ? { status: nextState, statusChangedAt: now } : {}),
      })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  });
}

export async function setTaskStatus(
  db: Db,
  actor: Actor,
  taskId: string,
  action: 'complete' | 'pause' | 'resume' | 'cancel',
  reason?: string,
  now: Date = new Date(),
): Promise<Task> {
  const trimmed = reason?.trim() || null;
  if ((action === 'pause' || action === 'cancel') && !trimmed) {
    throw new DomainError('VALIDATION', 'reasonRequired');
  }
  return db.transaction(async (tx) => {
    const { task, owner } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    requireOwner(actor, task);
    const taskAction: TaskAction = action;
    const to = nextStatus(lifecycleCtx(task, owner.managerId), taskAction, 'owner');
    if (action === 'complete' && task.mode === 'project' && owner.managerId !== null && !task.isPrivate) {
      const [summary] = await tx
        .select({ id: solutionSummaries.id })
        .from(solutionSummaries)
        .where(eq(solutionSummaries.taskId, taskId));
      if (!summary) {
        throw new DomainError('VALIDATION', 'summaryRequiredBeforeDone');
      }
    }
    if (action === 'complete') {
      const open = (await currentPlan(tx, taskId)).steps.filter((s) => s.status !== 'done');
      if (open.length > 0) {
        throw new DomainError('VALIDATION', 'stepsNotConfirmed', { steps: open.map((s) => s.title).join(', ') });
      }
    }
    const [updated] = await tx
      .update(tasks)
      .set({
        status: to,
        statusChangedAt: now,
        statusReason: trimmed,
        ...(to === 'done' || to === 'awaiting_review' ? { completedAt: now } : {}),
      })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  });
}

export async function makePublic(
  db: Db,
  actor: Actor,
  taskId: string,
  now: Date = new Date(),
): Promise<Task> {
  return db.transaction(async (tx) => {
    const { task, owner } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    requireOwner(actor, task);
    if (!task.isPrivate) throw new DomainError('VALIDATION', 'alreadyPublic');
    if (TERMINAL_STATUSES.includes(task.status)) {
      throw new DomainError('INVALID_TRANSITION', 'cannotPublishStatus', { status: task.status });
    }
    const hasManager = owner.managerId !== null;
    const [updated] = await tx
      .update(tasks)
      .set({
        isPrivate: false,
        ...(hasManager
          ? { status: 'pending_confirmation' as const, confirmerIdAtCreation: owner.managerId, statusChangedAt: now }
          : {}),
      })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  });
}
