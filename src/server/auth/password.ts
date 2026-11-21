import { hash, verify } from '@node-rs/argon2';
import { DomainError } from '../errors';

export const MIN_PASSWORD_LENGTH = 8;

/** `field` names the form field that carries the password, so the UI can show the error under it. */
export function assertPasswordLength(pw: string, field = 'password'): void {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError('VALIDATION', 'passwordTooShort', { min: MIN_PASSWORD_LENGTH, field });
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
