import { describe, it, expect } from 'vitest';
import { computeHealth, progressPct } from '@/server/tasks/health';

const base = {
  status: 'in_progress' as const,
  agreedDueDate: '2026-12-30',
  expectedEndDate: '2026-12-30',
  lastActivityAt: new Date('2026-11-23T03:00:00Z'),
  hasOpenBlocker: false,
  staleBusinessDays: 3,
  now: new Date('2026-11-23T04:00:00Z'),
};

describe('computeHealth', () => {
  it('on_track by default', () => {
    expect(computeHealth(base)).toEqual({ health: 'on_track', overdue: false, stale: false });
  });
  it('open blocker → blocked', () => {
    expect(computeHealth({ ...base, hasOpenBlocker: true }).health).toBe('blocked');
  });
  it('expected > agreed → at_risk + overdue', () => {
    expect(computeHealth({ ...base, expectedEndDate: '2027-01-05' })).toEqual({ health: 'at_risk', overdue: true, stale: false });
  });
  it('past agreed due date and not done → overdue; done → not overdue', () => {
    const now = new Date('2026-12-31T02:00:00Z');
    expect(computeHealth({ ...base, now, lastActivityAt: now }).overdue).toBe(true);
    expect(computeHealth({ ...base, now, lastActivityAt: now, status: 'done' }).overdue).toBe(false);
  });
  it('due date uses VN calendar day', () => {
    // 2026-12-30 17:30Z = 2026-12-31 00:30 VN
    const now = new Date('2026-12-30T17:30:00Z');
    expect(computeHealth({ ...base, now, lastActivityAt: now }).overdue).toBe(true);
    const before = new Date('2026-12-30T16:30:00Z');
    expect(computeHealth({ ...base, now: before, lastActivityAt: before }).overdue).toBe(false);
  });
  it('update Fri 17:00 VN, viewed Mon 09:00 VN → not stale', () => {
    expect(computeHealth({
      ...base, lastActivityAt: new Date('2026-11-20T10:00:00Z'), now: new Date('2026-11-23T02:00:00Z'),
    }).stale).toBe(false);
  });
  it('update from Mon, viewed Thu → stale + at_risk', () => {
    expect(computeHealth({
      ...base, lastActivityAt: new Date('2026-11-23T02:00:00Z'), now: new Date('2026-11-26T03:00:00Z'),
    })).toEqual({ health: 'at_risk', overdue: false, stale: true });
  });
  it('stale only applies to in_progress/paused', () => {
    expect(computeHealth({
      ...base, status: 'pending_confirmation',
      lastActivityAt: new Date('2026-11-23T02:00:00Z'), now: new Date('2026-11-30T03:00:00Z'),
    }).stale).toBe(false);
  });
});

describe('progressPct', () => {
  const plan = { steps: [{ title: 'a', status: 'done' }, { title: 'b', status: 'todo' }, { title: 'c', status: 'todo' }] } as never;
  it('uses steps, rounded', () => expect(progressPct(plan)).toBe(33));
  it('ignores any override', () => expect(progressPct(plan, 80)).toBe(33));
  it('does not count pending_approval steps', () => {
    const p = { steps: [{ title: 'a', status: 'done' }, { title: 'b', status: 'pending_approval' }] } as never;
    expect(progressPct(p)).toBe(50);
  });
  it('empty plan is 0', () => expect(progressPct({ steps: [] } as never)).toBe(0));
});
