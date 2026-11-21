import { hash, verify } from '@node-rs/argon2';
import { DomainError } from '../errors';

export const MIN_PASSWORD_LENGTH = 8;

export function assertPasswordLength(pw: string): void {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError('VALIDATION', 'passwordTooShort', { min: MIN_PASSWORD_LENGTH });
  }
}

// The library default algorithm is argon2id (asserted in tests).
export function hashPassword(pw: string): Promise<string> {
  return hash(pw);
}

export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}
