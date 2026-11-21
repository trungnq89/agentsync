import { describe, expect, it } from 'vitest';
import { DomainError } from '@/server/errors';
import { seedErrorMessage, seedAdmin } from '../../scripts/seed-admin';
import { testDb } from '../helpers/db';

describe('seed-admin messages', () => {
  it('translates DomainError instead of printing the raw key', () => {
    const e = new DomainError('VALIDATION', 'passwordTooShort', { min: 8, field: 'password' });
    expect(seedErrorMessage(e, 'en')).toBe('The password must be at least 8 characters.');
    expect(seedErrorMessage(e, 'en')).not.toContain('passwordTooShort');
    expect(seedErrorMessage(e, 'vi')).not.toBe(seedErrorMessage(e, 'en'));
  });
  it('falls back to plain message for other errors', () => {
    expect(seedErrorMessage(new Error('boom'), 'en')).toBe('boom');
    expect(seedErrorMessage('x', 'en')).toBe('x');
  });
  it('duplicate username is a translated DomainError', async () => {
    await seedAdmin(testDb, 'root', 'longenough1');
    const err = await seedAdmin(testDb, 'root', 'longenough1').catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(seedErrorMessage(err, 'en')).toBe('This username is already taken.');
  });
});
