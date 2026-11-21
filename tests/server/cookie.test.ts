import { describe, it, expect } from 'vitest';
import { cookieSecure } from '@/server/auth/cookie';

describe('cookieSecure', () => {
  it('follows APP_URL scheme by default', () => {
    expect(cookieSecure({ APP_URL: 'https://a.example.com' })).toBe(true);
    expect(cookieSecure({ APP_URL: 'http://localhost:3000' })).toBe(false);
    expect(cookieSecure({})).toBe(false);
  });
  it('COOKIE_SECURE overrides', () => {
    expect(cookieSecure({ APP_URL: 'https://a', COOKIE_SECURE: 'false' })).toBe(false);
    expect(cookieSecure({ APP_URL: 'http://a', COOKIE_SECURE: 'true' })).toBe(true);
    expect(cookieSecure({ APP_URL: 'https://a', COOKIE_SECURE: '' })).toBe(true);
  });
});
