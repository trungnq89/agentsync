import 'dotenv/config';
import { Client } from 'pg';
import { runMigrations } from '../src/db/migrate';

// Arbitrary constant; advisory locks are scoped to the database, so this only guards DATABASE_URL_TEST.
const LOCK_KEY = 726_001_024;

let lockClient: Client | undefined;

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');
  // Two vitest runs on one database truncate each other's rows mid-test: fail fast instead of flaking.
  lockClient = new Client({ connectionString: url });
  lockClient.on('error', () => {}); // a dropped lock connection must not crash the run
  await lockClient.connect();
  const { rows } = await lockClient.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
  if (!rows[0].ok) {
    await lockClient.end();
    lockClient = undefined;
    throw new Error('Another vitest run is already using DATABASE_URL_TEST. Wait for it to finish (concurrent runs corrupt each other).');
  }
  await runMigrations(url);
  return async () => {
    await lockClient?.end(); // closing the session releases the lock
    lockClient = undefined;
  };
}
