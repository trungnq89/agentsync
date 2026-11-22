import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DomainError } from './errors';

const keyMissing = () => new DomainError('VALIDATION', 'odooKeyMissing');

/** 32-byte key from SETTINGS_ENCRYPTION_KEY (base64). Null when absent or malformed. */
function readKey(): Buffer | null {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

export function isEncryptionReady(): boolean {
  return readKey() !== null;
}

/** AES-256-GCM. Stored form: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. */
export function encryptSecret(plain: string): string {
  const key = readKey();
  if (!key) throw keyMissing();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(enc: string): string {
  const key = readKey();
  if (!key) throw keyMissing();
  const parts = enc.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw keyMissing();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw keyMissing();
  }
}
