import { businessDaysBetween, vnDateString } from '@/server/clock';
import { DONE_STATUSES, type TaskStatus } from './lifecycle';
import type { PlanVersion } from './internal';

export type Health = 'on_track' | 'at_risk' | 'blocked';

export function progressPct(plan: Pick<PlanVersion, 'steps'>, override: number | null): number {
  if (override !== null) return override;
  const total = plan.steps.length;
  if (total === 0) return 0;
  return Math.round((plan.steps.filter((s) => s.status === 'done').length / total) * 100);
}

export interface HealthInput {
  status: TaskStatus;
  agreedDueDate: string;
  expectedEndDate: string;
  /** max(createdAt, latest update, statusChangedAt) */
  lastActivityAt: Date;
  hasOpenBlocker: boolean;
  staleBusinessDays: number;
  now: Date;
}

export function computeHealth(i: HealthInput): { health: Health; overdue: boolean; stale: boolean } {
  const overdue =
    i.expectedEndDate > i.agreedDueDate ||
    (vnDateString(i.now) > i.agreedDueDate && !DONE_STATUSES.includes(i.status));
  const stale =
    (i.status === 'in_progress' || i.status === 'paused') &&
    businessDaysBetween(i.lastActivityAt, i.now) >= i.staleBusinessDays;
  const health: Health = i.hasOpenBlocker ? 'blocked' : overdue || stale ? 'at_risk' : 'on_track';
  return { health, overdue, stale };
}
