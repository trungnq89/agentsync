import { describe, it, expect } from 'vitest';
import { barSpan, computeAxis, position } from '../../app/_lib/timeline';

const D = 86_400_000;
const t = (startDate: string, expectedEndDate: string) => ({ startDate, expectedEndDate });

describe('timeline axis', () => {
  it('single task: start-3d to end+1d+7d', () => {
    const a = computeAxis([t('2026-11-10', '2026-11-20')], '2026-11-15');
    expect(a.min).toBe(Date.parse('2026-11-07T00:00:00Z'));
    expect(a.max).toBe(Date.parse('2026-11-28T00:00:00Z'));
    expect(a.span).toBe(21 * D);
  });
  it('start == end still has a one-day bar', () => {
    const a = computeAxis([t('2026-11-10', '2026-11-10')], '2026-11-10');
    const b = barSpan('2026-11-10', '2026-11-10', a);
    expect(b.width).toBeCloseTo((D / a.span) * 100, 5);
  });
  it('slipped agreed marker is clamped inside 0-100', () => {
    const a = computeAxis([t('2026-11-10', '2026-11-20')], '2026-11-15');
    expect(position('2026-11-15', a)).toBeGreaterThan(0);
    expect(position('2026-01-01', a)).toBe(0);
    expect(position('2027-01-01', a)).toBe(100);
  });
  it('axis includes today even when all tasks are in the future or past', () => {
    const past = computeAxis([t('2026-11-01', '2026-11-05')], '2026-11-21');
    expect(past.max).toBe(Date.parse('2026-11-28T00:00:00Z'));
    const future = computeAxis([t('2026-12-01', '2026-12-05')], '2026-11-21');
    expect(future.min).toBe(Date.parse('2026-11-18T00:00:00Z'));
    expect(position('2026-11-21', future)).toBeGreaterThan(0);
  });
  it('far-past task: today line near the right end, bar stays within 0-100', () => {
    const a = computeAxis([t('2026-06-20', '2026-07-10')], '2026-11-21');
    expect(position('2026-11-21', a)).toBeGreaterThan(85);
    const b = barSpan('2026-06-20', '2026-07-10', a);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.left + b.width).toBeLessThanOrEqual(100);
  });
});
