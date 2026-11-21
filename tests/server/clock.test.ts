import { describe, it, expect } from 'vitest';
import { businessDaysBetween, isWithinHours } from '@/server/clock';

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
});
