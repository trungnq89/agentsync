import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { checkpointReviews, planVersions, users, type PlanStep, type Task, type User } from '@/db/schema';
import { isCurrentManagerOf, loadTaskForViewer, type Actor } from '@/server/authz';
import { DomainError } from '@/server/errors';
import { isUuid } from '@/server/ids';
import { asDb, currentPlan } from './internal';
import { TERMINAL_STATUSES } from './lifecycle';

export type Confirmer = 'member' | 'manager';
const CONFIRMERS: readonly string[] = ['member', 'manager'];

/** Who confirms checkpoints for a task: the owner's setting, unless nobody else can (private / no manager). */
export function effectiveConfirmer(
  task: Pick<Task, 'isPrivate'>,
  owner: Pick<User, 'managerId' | 'checkpointConfirmer'>,
): Confirmer {
  if (task.isPrivate || owner.managerId === null) return 'member';
  return owner.checkpointConfirmer === 'manager' ? 'manager' : 'member';
}

/** Direct manager only. Anyone else (incl. admin) gets NOT_FOUND. */
export async function setCheckpointConfirmer(
  db: Db,
  actor: Actor,
  userId: string,
  confirmer: Confirmer,
): Promise<User> {
  const notFound = () => new DomainError('NOT_FOUND', 'notFoundUser');
  if (!isUuid(userId)) throw notFound();
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!target || !isCurrentManagerOf(actor, target)) throw notFound();
    if (!CONFIRMERS.includes(confirmer)) {
      throw new DomainError('VALIDATION', 'invalidConfirmer', { field: 'confirmer' });
    }
    const [updated] = await tx.update(users).set({ checkpointConfirmer: confirmer }).where(eq(users.id, userId)).returning();
    return updated;
  });
}

/** Step titles identify steps, so they must be unique within a plan. */
export function assertUniqueStepTitles(titles: string[]): void {
  if (new Set(titles).size !== titles.length) throw new DomainError('VALIDATION', 'duplicateStepTitle');
}

/**
 * Normalise agent-submitted steps against the stored plan: the server owns confirmed state.
 * A step with an unchanged title keeps its stored step (status + confirmation); new/renamed steps
 * start at todo. The agent may only choose todo/doing.
 */
export function normalizePlanSteps(submitted: PlanStep[], stored: PlanStep[]): PlanStep[] {
  const byTitle = new Map(stored.map((s) => [s.title, s]));
  return submitted.map((s) => {
    const prev = byTitle.get(s.title);
    if (prev && (prev.status === 'done' || prev.status === 'pending_approval')) return { ...prev };
    return { title: s.title, status: s.status === 'doing' ? 'doing' : 'todo' };
  });
}

/**
 * Direct manager approves or rejects steps waiting for approval. stepTitle null = all pending steps
 * (approval only). Pattern: same as setCheckpointConfirmer, everyone who is not the owner's current
 * direct manager (owner, admin, strangers, old manager, anyone on a private task) gets NOT_FOUND.
 */
export async function reviewCheckpoint(
  db: Db,
  actor: Actor,
  taskId: string,
  stepTitle: string | null,
  decision: 'approved' | 'rejected',
  note?: string,
  now: Date = new Date(),
  via: 'agent' | 'web' = 'web',
): Promise<{ approved: number; rejected: number }> {
  const trimmed = note?.trim() || null;
  if (decision === 'rejected') {
    if (stepTitle === null) throw new DomainError('VALIDATION', 'rejectNeedsStep');
    if (!trimmed) throw new DomainError('VALIDATION', 'noteRequiredForReject', { field: 'note' });
  }
  return db.transaction(async (tx) => {
    const { task, owner } = await loadTaskForViewer(asDb(tx), actor, taskId, { forUpdate: true });
    if (actor.id === task.ownerId || !isCurrentManagerOf(actor, owner)) {
      throw new DomainError('NOT_FOUND', 'notFoundTask');
    }
    if (TERMINAL_STATUSES.includes(task.status)) throw new DomainError('INVALID_TRANSITION', 'taskClosed');
    const plan = await currentPlan(tx, taskId);
    if (stepTitle !== null && !plan.steps.some((s) => s.title === stepTitle)) {
      throw new DomainError('VALIDATION', 'unknownSteps', { steps: stepTitle });
    }
    const targets = plan.steps.filter((s) => s.status === 'pending_approval' && (stepTitle === null || s.title === stepTitle));
    if (targets.length === 0) throw new DomainError('VALIDATION', 'stepNotPending');
    const titles = new Set(targets.map((s) => s.title));
    const steps: PlanStep[] = plan.steps.map((s) => {
      if (!titles.has(s.title)) return s;
      if (decision === 'approved') {
        return { title: s.title, status: 'done', confirmedBy: 'manager', confirmedById: actor.id, confirmedAt: now.toISOString(), confirmedVia: via };
      }
      return { title: s.title, status: 'doing' };
    });
    await tx.update(planVersions).set({ steps }).where(eq(planVersions.id, plan.id));
    await tx.insert(checkpointReviews).values(targets.map((s) => ({
      taskId, stepTitle: s.title, decision, note: decision === 'rejected' ? trimmed : null, reviewerId: actor.id, createdAt: now,
    })));
    return decision === 'approved' ? { approved: targets.length, rejected: 0 } : { approved: 0, rejected: targets.length };
  });
}
