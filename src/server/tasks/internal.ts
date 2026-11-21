import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { planVersions, type Task } from '@/db/schema';
import type { Actor } from '@/server/authz';
import { DomainError } from '@/server/errors';

export type PlanVersion = typeof planVersions.$inferSelect;

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
// A transaction exposes the same query API; authz helpers only use that.
export const asDb = (tx: Tx) => tx as unknown as Db;

export function lifecycleCtx(task: Task, managerId: string | null) {
  return { status: task.status, mode: task.mode, hasManager: managerId !== null, isPrivate: task.isPrivate };
}

export async function currentPlan(tx: Tx | Db, taskId: string): Promise<PlanVersion> {
  const [v] = await tx
    .select()
    .from(planVersions)
    .where(eq(planVersions.taskId, taskId))
    .orderBy(desc(planVersions.version))
    .limit(1);
  if (!v) throw new DomainError('NOT_FOUND', 'notFoundPlan');
  return v;
}

export function requireOwner(actor: Actor, task: Task) {
  if (actor.id !== task.ownerId) throw new DomainError('FORBIDDEN', 'ownerOnly');
}

