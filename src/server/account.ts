import { and, desc, eq, ne } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { agentTokens, pendingCredentials, sessions, users, type AgentToken } from '@/db/schema';
import { assertPasswordLength, hashPassword, verifyPassword } from './auth/password';
import type { Actor } from './authz';
import { DomainError } from './errors';

export type TokenInfo = Pick<AgentToken, 'id' | 'label' | 'prefix' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>;

/** The actor's own tokens, newest first. Never exposes hashes. */
export async function listMyTokens(db: Db, actor: Actor): Promise<TokenInfo[]> {
  return db
    .select({
      id: agentTokens.id,
      label: agentTokens.label,
      prefix: agentTokens.prefix,
      createdAt: agentTokens.createdAt,
      lastUsedAt: agentTokens.lastUsedAt,
      revokedAt: agentTokens.revokedAt,
    })
    .from(agentTokens)
    .where(eq(agentTokens.userId, actor.id))
    .orderBy(desc(agentTokens.createdAt), desc(agentTokens.id));
}

export async function setMySendMode(db: Db, actor: Actor, mode: 'auto' | 'review'): Promise<void> {
  if (mode !== 'auto' && mode !== 'review') throw new DomainError('VALIDATION', 'invalidSendMode');
  await db.update(users).set({ sendMode: mode }).where(eq(users.id, actor.id));
}

/** Changes the actor's password; other sessions are signed out (the one in `keepSessionId` stays). */
export async function changeMyPassword(
  db: Db,
  actor: Actor,
  current: string,
  next: string,
  keepSessionId?: string,
): Promise<void> {
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  if (!row || !(await verifyPassword(row.hash, current))) {
    throw new DomainError('VALIDATION', 'wrongCurrentPassword', { field: 'current' });
  }
  assertPasswordLength(next, 'next');
  await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(users.id, actor.id));
  await db.delete(pendingCredentials).where(eq(pendingCredentials.userId, actor.id));
  await db
    .delete(sessions)
    .where(keepSessionId ? and(eq(sessions.userId, actor.id), ne(sessions.id, keepSessionId)) : eq(sessions.userId, actor.id));
}
