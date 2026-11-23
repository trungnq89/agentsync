import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { users, type PlanStep, type Task, type User } from '@/db/schema';
import { isCurrentManagerOf, type Actor } from '@/server/authz';
import { DomainError } from '@/server/errors';
import { isUuid } from '@/server/ids';

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
