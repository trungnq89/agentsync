import { randomBytes } from 'node:crypto';
import { eq, or, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { sessions, users, type User } from '@/db/schema';
import { DomainError } from '../errors';
import { hashPassword, verifyPassword } from './password';

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

let dummyHash: Promise<string> | undefined;

export async function login(db: Db, identifier: string, pw: string): Promise<{ sessionId: string; user: User }> {
  const email = identifier.trim().toLowerCase();
  // Exact username wins over an email match when both could apply.
  const matches = await db
    .select()
    .from(users)
    .where(or(eq(users.username, identifier), sql`lower(${users.email}) = ${email}`));
  const user = matches.find((u) => u.username === identifier) ?? matches[0];
  // Always run a verification so unknown users take about as long as known ones.
  const ok = await verifyPassword(user?.passwordHash ?? (await (dummyHash ??= hashPassword('dummy'))), pw);
  if (!user || !ok || user.disabledAt) throw new DomainError('UNAUTHORIZED', 'badLogin');

  const sessionId = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return { sessionId, user };
}

export async function getSessionUser(db: Db, sessionId: string, now: Date = new Date()): Promise<User | null> {
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId));
  if (!row || row.expiresAt <= now || row.user.disabledAt) return null;
  return row.user;
}

export async function logout(db: Db, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
