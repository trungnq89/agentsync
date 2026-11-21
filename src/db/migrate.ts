import 'dotenv/config';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

// Resolved from this file, not the cwd, so it works from any working directory.
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(url: string) {
  const db = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}

function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Set it to a postgres:// connection string.');
    process.exit(1);
  }
  runMigrations(url).then(
    () => console.log('migrated'),
    (e) => { console.error(e); process.exit(1); },
  );
}
