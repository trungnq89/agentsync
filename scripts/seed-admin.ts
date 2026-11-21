import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client';
import { users } from '../src/db/schema';
import { defaultLocale, type Locale } from '../src/i18n/config';
import { serverTranslator } from '../src/i18n/translator';
import { DomainError, translateError } from '../src/server/errors';
import { assertPasswordLength, hashPassword } from '../src/server/auth/password';

export async function seedAdmin(db: Db, username: string, password: string): Promise<void> {
  assertPasswordLength(password);
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (dup) throw new DomainError('VALIDATION', 'usernameTaken', { field: 'username' });
  await db.insert(users).values({
    username,
    displayName: username,
    passwordHash: await hashPassword(password),
    level: 'director',
    isAdmin: true,
  });
}

/** Message shown for a failed seed; domain errors are translated, never printed as raw keys. */
export function seedErrorMessage(e: unknown, locale: Locale): string {
  if (e instanceof DomainError) return translateError(e, locale);
  return e instanceof Error ? e.message : String(e);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Password source: SEED_ADMIN_PASSWORD (preferred), --password (discouraged: visible in ps/history), else stdin. */
async function resolvePassword(): Promise<string | undefined> {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  const fromArg = arg('password');
  if (fromArg) return fromArg;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(serverTranslator(defaultLocale(), 'cli')('passwordPrompt'))).trim() || undefined;
  } finally {
    rl.close();
  }
}

async function main() {
  const locale = defaultLocale();
  const t = serverTranslator(locale, 'cli');
  const username = arg('username');
  const password = username ? await resolvePassword() : undefined;
  if (!username || !password) {
    console.error(t('usage'));
    process.exit(1);
  }
  const db = createDb(process.env.DATABASE_URL!);
  seedAdmin(db, username, password).then(
    async () => {
      console.log(t('adminCreated', { username }));
      await db.$client.end();
    },
    async (e) => {
      console.error(seedErrorMessage(e, locale));
      await db.$client.end();
      process.exit(1);
    },
  );
}

if (process.argv[1]?.endsWith('seed-admin.ts')) void main();
