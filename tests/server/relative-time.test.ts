import { describe, it, expect } from 'vitest';
import { relativeTime } from '../../app/_lib/relative-time';

const now = new Date('2026-11-21T05:00:00Z'); // 12:00 in Asia/Ho_Chi_Minh
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('relativeTime', () => {
  it('under a minute', () => expect(relativeTime(ago(30_000), now)).toBe('vừa xong'));
  it('minutes', () => expect(relativeTime(ago(5 * MIN), now)).toBe('5 phút trước'));
  it('hours', () => expect(relativeTime(ago(2 * HOUR), now)).toBe('2 giờ trước'));
  it('yesterday by Vietnam calendar day', () => {
    expect(relativeTime(ago(25 * HOUR), now)).toBe('hôm qua');
  });
  it('days', () => expect(relativeTime(ago(3 * 24 * HOUR), now)).toBe('3 ngày trước'));
  it('uses Vietnam timezone for the day boundary', () => {
    const n = new Date('2026-11-21T18:00:00Z'); // 22/11 01:00 VN
    expect(relativeTime(new Date('2026-11-21T10:00:00Z'), n)).toBe('8 giờ trước');
    expect(relativeTime(new Date('2026-11-20T10:00:00Z'), n)).toBe('2 ngày trước'); // 20/11 17:00 VN vs 22/11 01:00 VN (UTC days would say 1)
  });
  it('future dates count as just now', () => expect(relativeTime(new Date(now.getTime() + HOUR), now)).toBe('vừa xong'));
});
