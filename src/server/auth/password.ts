import { hash, verify } from '@node-rs/argon2';

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
