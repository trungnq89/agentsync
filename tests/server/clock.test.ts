import { describe, it, expect } from 'vitest';
import { businessDaysBetween, isValidIsoDate, isWithinHours, vnDateString } from '@/server/clock';

describe('clock', () => {
  it('Fri 17:00 VN to Mon 09:00 VN is 0 business days', () => {
    expect(businessDaysBetween(new Date('2026-11-20T10:00:00Z'), new Date('2026-11-23T02:00:00Z'))).toBe(0);
  });
  it('Mon 09:00 to Thu 09:00 VN is 3 business days', () => {
    expect(businessDaysBetween(new Date('2026-11-23T02:00:00Z'), new Date('2026-11-26T02:00:00Z'))).toBe(3);
  });
  it('isWithinHours boundary', () => {
    const s = new Date('2026-11-21T00:00:00Z');
    expect(isWithinHours(s, new Date('2026-11-21T23:59:59Z'), 24)).toBe(true);
    expect(isWithinHours(s, new Date('2026-11-22T00:00:01Z'), 24)).toBe(false);
  });
  it('vnDateString gives the Asia/Ho_Chi_Minh calendar date', () => {
    expect(vnDateString(new Date('2026-11-20T16:59:59Z'))).toBe('2026-11-20');
    expect(vnDateString(new Date('2026-11-20T17:00:00Z'))).toBe('2026-11-21');
  });
});

describe('isValidIsoDate', () => {
  it('accepts real dates only', () => {
    expect(isValidIsoDate('2026-11-30')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    for (const bad of ['next week', '2026-2-3', '2026-02-30', '2026-13-01', '2026-11-30T00:00', '']) {
      expect(isValidIsoDate(bad)).toBe(false);
    }
  });
});
