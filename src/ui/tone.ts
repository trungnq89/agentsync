import type { TaskStatus } from '@/server/tasks/lifecycle';
import type { Health } from '@/server/tasks/health';
import type { AttentionKind } from '@/server/tasks/queries';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_TONE: Record<TaskStatus, Tone> = {
  pending_confirmation: 'info',
  awaiting_review: 'info',
  changes_requested: 'warning',
  in_progress: 'primary',
  paused: 'neutral',
  done: 'success',
  closed: 'success',
  cancelled: 'neutral',
};

const HEALTH_TONE: Record<Health, Tone> = { on_track: 'success', at_risk: 'warning', blocked: 'danger' };

const ATTENTION_TONE: Record<AttentionKind, Tone> = {
  blocked: 'danger',
  overdue: 'warning',
  stale: 'warning',
  changes_requested: 'warning',
  pending_confirmation: 'info',
  awaiting_review: 'info',
  question_for_me: 'info',
  paused_or_cancelled: 'neutral',
};

export const toneForStatus = (s: TaskStatus): Tone => STATUS_TONE[s];
export const toneForHealth = (h: Health): Tone => HEALTH_TONE[h];
export const toneForAttention = (k: AttentionKind): Tone => ATTENTION_TONE[k];
