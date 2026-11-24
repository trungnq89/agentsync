import { describe, it, expect } from 'vitest';
import { isInsecureAppUrl } from '@/server/auth/insecure-url';

describe('isInsecureAppUrl', () => {
  it.each([
    ['http://192.168.1.10:3000', true],
    ['http://agentsync.example.com', true],
    ['HTTP://example.com', true],
    ['http://localhost:3000', false],
    ['http://127.0.0.1:3000', false],
    ['http://[::1]:3000', false],
    ['https://x', false],
    ['https://192.168.1.10', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (url, expected) => {
    expect(isInsecureAppUrl(url)).toBe(expected);
  });
});
