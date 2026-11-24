import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { tasks, users, type Task, type User } from '@/db/schema';
import { DomainError } from './errors';
import { isUuid } from './ids';

/** Admin flag only grants user management, never visibility of others' tasks. */
export type Actor = Pick<User, 'id' | 'isAdmin'> & {
  /** Set for agent-token requests; a `member` token never acts as a manager. Web sessions leave it unset. */
  tokenScope?: 'member' | 'manager';
};

export function requireAdmin(actor: Actor): void {
  if (!actor.isAdmin) throw new DomainError('FORBIDDEN', 'adminOnly');
}

/** Direct manager only: no inheritance up the chain. */
export function isCurrentManagerOf(actor: Actor, owner: Pick<User, 'managerId'>): boolean {
  if (actor.tokenScope === 'member') return false;
  return owner.managerId !== null && owner.managerId === actor.id;
}

export function canViewUser(actor: Actor, target: Pick<User, 'id' | 'managerId'>): boolean {
  return target.id === actor.id || isCurrentManagerOf(actor, target);
}

export function canViewTask(
  actor: Actor,
  task: Pick<Task, 'ownerId' | 'isPrivate'>,
  owner: Pick<User, 'id' | 'managerId'>,
): boolean {
  if (task.ownerId === actor.id) return true;
  return !task.isPrivate && isCurrentManagerOf(actor, owner);
}

export async function loadTaskForViewer(
  db: Db,
  actor: Actor,
  taskId: string,
  opts: { forUpdate?: boolean } = {},
): Promise<{ task: Task; owner: User }> {
  const notFound = () => new DomainError('NOT_FOUND', 'notFoundTask');
  if (!isUuid(taskId)) throw notFound();
  // Lock the task row first so the read below sees the latest committed state.
  if (opts.forUpdate) await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).for('update');
  const [row] = await db
    .select({ task: tasks, owner: users })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.ownerId))
    .where(eq(tasks.id, taskId));
  if (!row || !canViewTask(actor, row.task, row.owner)) throw notFound();
  return row;
}
