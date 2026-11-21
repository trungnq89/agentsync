import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

export async function runMigrations(url: string) {
  const db = createDb(url);
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.$client.end();
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations(process.env.DATABASE_URL!).then(
    () => console.log('migrated'),
    (e) => { console.error(e); process.exit(1); },
  );
}
