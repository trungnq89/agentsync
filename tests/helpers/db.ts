import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');

export const testDb = createDb(url);

const tableNames = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => `"${getTableName(t)}"`);

export async function resetDb(): Promise<void> {
  await testDb.execute(sql.raw(`TRUNCATE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`));
}
