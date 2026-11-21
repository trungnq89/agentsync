import 'dotenv/config';
import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import { seedAdmin } from '../../scripts/seed-admin';

const url = process.env.DATABASE_URL_E2E;
if (!url) throw new Error('DATABASE_URL_E2E is not set (see .env.example)');

const tableNames = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => `"${getTableName(t)}"`);

/** Truncate the e2e database and seed app_settings plus one admin. */
export async function resetE2eDb(admin: { username: string; password: string }): Promise<void> {
  const db = createDb(url!);
  try {
    await db.execute(sql.raw(`TRUNCATE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`));
    await db.insert(schema.appSettings).values({ id: 1, staleBusinessDays: 3 });
    await seedAdmin(db, admin.username, admin.password);
  } finally {
    await db.$client.end();
  }
}
