import { afterAll, beforeEach } from 'vitest';
// Fixed test-only key (32 bytes, base64); real deployments generate their own.
process.env.SETTINGS_ENCRYPTION_KEY ??= 'dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNDU=';
import { resetDb, testDb } from './helpers/db';

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$client.end();
});
