import { describe, it, expect } from 'vitest';
import { formatDate, formatRelative } from '../../app/_lib/format';

const now = new Date('2026-11-21T05:00:00Z'); // 12:00 in Asia/Ho_Chi_Minh
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('formatRelative vi', () => {
  const f = (d: Date, n = now) => formatRelative(d, n, 'vi');
  it('under a minute', () => expect(f(ago(30_000))).toBe('bây giờ'));
  it('minutes', () => expect(f(ago(5 * MIN))).toBe('5 phút trước'));
  it('hours', () => expect(f(ago(2 * HOUR))).toBe('2 giờ trước'));
  it('yesterday by Vietnam calendar day', () => expect(f(ago(25 * HOUR))).toBe('hôm qua'));
  it('days', () => expect(f(ago(3 * 24 * HOUR))).toBe('3 ngày trước'));
  it('uses Vietnam timezone for the day boundary', () => {
    const n = new Date('2026-11-21T18:00:00Z'); // 22/11 01:00 VN
    expect(f(new Date('2026-11-21T10:00:00Z'), n)).toBe('8 giờ trước');
    expect(f(new Date('2026-11-20T10:00:00Z'), n)).toBe('hôm kia'); // UTC days would say 1 ("hôm qua")
  });
  it('future dates count as just now', () => expect(f(new Date(now.getTime() + HOUR))).toBe('bây giờ'));
});

describe('formatRelative en', () => {
  const f = (d: Date, n = now) => formatRelative(d, n, 'en');
  it('under a minute', () => expect(f(ago(30_000))).toBe('now'));
  it('minutes', () => expect(f(ago(5 * MIN))).toBe('5 minutes ago'));
  it('hours', () => expect(f(ago(2 * HOUR))).toBe('2 hours ago'));
  it('yesterday', () => expect(f(ago(25 * HOUR))).toBe('yesterday'));
  it('days', () => expect(f(ago(3 * 24 * HOUR))).toBe('3 days ago'));
  it('Vietnam day boundary', () => {
    const n = new Date('2026-11-21T18:00:00Z');
    expect(f(new Date('2026-11-20T10:00:00Z'), n)).toBe('2 days ago');
  });
});

describe('formatDate', () => {
  it('short date per locale', () => {
    expect(formatDate('2026-11-21', 'en')).toBe('Nov 21, 2026');
    expect(formatDate('2026-11-21', 'vi')).toBe('21 thg 11, 2026');
  });
});
