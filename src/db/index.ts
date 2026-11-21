import { createDb, type Db } from './client';

let db: Db | undefined;

/** Module-level singleton from DATABASE_URL (created lazily on first use). */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    db = createDb(url);
  }
  return db;
}
