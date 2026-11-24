import { describe, it, expect } from 'vitest';
import { tokenDaysLeft } from '@/server/auth/token-expiry';

const NOW = new Date('2027-01-10T00:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
const DAY = 86_400_000;

describe('tokenDaysLeft', () => {
  it('is null once expired (exactly now included)', () => {
    expect(tokenDaysLeft(at(0), NOW)).toBeNull();
    expect(tokenDaysLeft(at(-1), NOW)).toBeNull();
  });
  it('rounds up the remaining time', () => {
    expect(tokenDaysLeft(at(1), NOW)).toBe(1);
    expect(tokenDaysLeft(at(DAY), NOW)).toBe(1);
    expect(tokenDaysLeft(at(DAY + 1), NOW)).toBe(2);
    expect(tokenDaysLeft(at(30 * DAY - 5), NOW)).toBe(30);
  });
  it('7-day boundary: 7d is 7, 7d+1h is 8', () => {
    expect(tokenDaysLeft(at(7 * DAY), NOW)).toBe(7);
    expect(tokenDaysLeft(at(7 * DAY + 3_600_000), NOW)).toBe(8);
  });
});
