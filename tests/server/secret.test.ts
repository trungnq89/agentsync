import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/server/secret';
import { DomainError } from '@/server/errors';

const saved = process.env.SETTINGS_ENCRYPTION_KEY;
afterEach(() => { process.env.SETTINGS_ENCRYPTION_KEY = saved; });
beforeEach(() => { process.env.SETTINGS_ENCRYPTION_KEY = saved; });

const expectKeyMissing = (fn: () => unknown) => {
  try { fn(); } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe('VALIDATION');
    expect((e as DomainError).key).toBe('odooKeyMissing');
    return;
  }
  throw new Error('expected throw');
};

describe('secret', () => {
  it('secret round-trip', () => {
    const enc = encryptSecret('my-api-key');
    expect(enc).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(enc).not.toContain('my-api-key');
    expect(decryptSecret(enc)).toBe('my-api-key');
  });

  it('tampered ciphertext → VALIDATION odooKeyMissing', () => {
    const parts = encryptSecret('x').split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 0xff;
    parts[3] = ct.toString('base64');
    expectKeyMissing(() => decryptSecret(parts.join(':')));
  });

  it('missing env → odooKeyMissing', () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expectKeyMissing(() => encryptSecret('x'));
    process.env.SETTINGS_ENCRYPTION_KEY = 'short';
    expectKeyMissing(() => encryptSecret('x'));
  });
});
