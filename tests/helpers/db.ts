import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');

const dbName = new URL(url).pathname.replace(/^\//, '');
function assertTestDb(): void {
  if (!dbName.endsWith('_test')) {
    throw new Error(`resetDb refused: database "${dbName}" does not end with _test (check DATABASE_URL_TEST).`);
  }
}

export const testDb = createDb(url);

const tableNames = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => `"${getTableName(t)}"`);

export async function resetDb(): Promise<void> {
  assertTestDb();
  await testDb.execute(sql.raw(`TRUNCATE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`));
  await testDb.insert(schema.appSettings).values({ id: 1, staleBusinessDays: 3 });
}
