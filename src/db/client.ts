import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  pool.on('error', (e) => console.error('pg pool error', e));
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
