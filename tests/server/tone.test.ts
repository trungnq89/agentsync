import { describe, expect, it } from 'vitest';
import { toneForAttention, toneForHealth, toneForStatus } from '@/ui/tone';

describe('tone mapping', () => {
  it.each([
    ['pending_confirmation', 'info'], ['awaiting_review', 'info'], ['changes_requested', 'warning'],
    ['in_progress', 'primary'], ['paused', 'neutral'], ['done', 'success'], ['closed', 'success'], ['cancelled', 'neutral'],
  ] as const)('status %s -> %s', (s, t) => expect(toneForStatus(s)).toBe(t));

  it.each([['on_track', 'success'], ['at_risk', 'warning'], ['blocked', 'danger']] as const)(
    'health %s -> %s', (h, t) => expect(toneForHealth(h)).toBe(t));

  it.each([
    ['blocked', 'danger'], ['overdue', 'warning'], ['stale', 'warning'], ['changes_requested', 'warning'],
    ['pending_confirmation', 'info'], ['awaiting_review', 'info'], ['question_for_me', 'info'], ['paused_or_cancelled', 'neutral'],
  ] as const)('attention %s -> %s', (k, t) => expect(toneForAttention(k)).toBe(t));
});
