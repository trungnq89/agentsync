import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client';
import { users } from '../src/db/schema';
import { assertPasswordLength, hashPassword } from '../src/server/auth/password';

export async function seedAdmin(db: Db, username: string, password: string): Promise<void> {
  assertPasswordLength(password);
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (dup) throw new Error(`Tên đăng nhập "${username}" đã tồn tại.`);
  await db.insert(users).values({
    username,
    displayName: username,
    passwordHash: await hashPassword(password),
    level: 'director',
    isAdmin: true,
  });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.endsWith('seed-admin.ts')) {
  const username = arg('username');
  const password = arg('password');
  if (!username || !password) {
    console.error('Usage: pnpm seed:admin --username <u> --password <p>');
    process.exit(1);
  }
  const db = createDb(process.env.DATABASE_URL!);
  seedAdmin(db, username, password).then(
    async () => {
      console.log(`Đã tạo admin "${username}".`);
      await db.$client.end();
    },
    async (e) => {
      console.error(e instanceof Error ? e.message : e);
      await db.$client.end();
      process.exit(1);
    },
  );
}
