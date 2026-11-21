import { taskStatus, taskMode } from '@/db/schema';
import { DomainError } from '@/server/errors';

export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type TaskMode = (typeof taskMode.enumValues)[number];
export type TaskAction =
  | 'confirm' | 'request_changes' | 'resubmit' | 'complete' | 'approve_review'
  | 'reject_review' | 'pause' | 'resume' | 'cancel';
export type Role = 'owner' | 'manager';

export const ACTIVE_STATUSES: readonly TaskStatus[] = [
  'pending_confirmation', 'changes_requested', 'in_progress', 'paused', 'awaiting_review',
];
export const DONE_STATUSES: readonly TaskStatus[] = ['done', 'closed'];
export const TERMINAL_STATUSES: readonly TaskStatus[] = ['done', 'closed', 'cancelled'];

interface Ctx { status: TaskStatus; mode: TaskMode; hasManager: boolean; isPrivate: boolean }
interface Rule { role: Role; to: (ctx: Ctx) => TaskStatus }

const fixed = (s: TaskStatus) => () => s;

const TABLE: Partial<Record<TaskStatus, Partial<Record<TaskAction, Rule>>>> = {
  pending_confirmation: {
    confirm: { role: 'manager', to: fixed('in_progress') },
    request_changes: { role: 'manager', to: fixed('changes_requested') },
  },
  changes_requested: {
    resubmit: { role: 'owner', to: fixed('pending_confirmation') },
  },
  in_progress: {
    complete: {
      role: 'owner',
      to: (c) => (c.mode === 'executive' || !c.hasManager || c.isPrivate ? 'done' : 'awaiting_review'),
    },
    pause: { role: 'owner', to: fixed('paused') },
  },
  awaiting_review: {
    approve_review: { role: 'manager', to: fixed('closed') },
    reject_review: { role: 'manager', to: fixed('in_progress') },
  },
  paused: {
    resume: { role: 'owner', to: fixed('in_progress') },
  },
};

const CANCEL: Rule = { role: 'owner', to: fixed('cancelled') };

export function nextStatus(ctx: Ctx, action: TaskAction, role: Role): TaskStatus {
  const rule = action === 'cancel'
    ? (TERMINAL_STATUSES.includes(ctx.status) ? undefined : CANCEL)
    : TABLE[ctx.status]?.[action];
  if (!rule) {
    throw new DomainError('INVALID_TRANSITION', `Không thể thực hiện "${action}" khi việc đang ở trạng thái "${ctx.status}".`);
  }
  if (rule.role !== role) {
    throw new DomainError('FORBIDDEN', `Chỉ ${rule.role === 'manager' ? 'quản lý' : 'chủ việc'} mới được thực hiện "${action}".`);
  }
  return rule.to(ctx);
}

export function initialStatus(ctx: { hasManager: boolean; isPrivate: boolean }): TaskStatus {
  return ctx.isPrivate || !ctx.hasManager ? 'in_progress' : 'pending_confirmation';
}
