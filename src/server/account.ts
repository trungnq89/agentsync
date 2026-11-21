import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { agentTokens, users, type AgentToken } from '@/db/schema';
import { hashPassword, verifyPassword } from './auth/password';
import type { Actor } from './authz';
import { DomainError } from './errors';

export const MIN_PASSWORD_LENGTH = 8;

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
  if (mode !== 'auto' && mode !== 'review') throw new DomainError('VALIDATION', 'Chế độ gửi không hợp lệ.');
  await db.update(users).set({ sendMode: mode }).where(eq(users.id, actor.id));
}

export async function changeMyPassword(db: Db, actor: Actor, current: string, next: string): Promise<void> {
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  if (!row || !(await verifyPassword(row.hash, current))) {
    throw new DomainError('VALIDATION', 'Mật khẩu hiện tại không đúng.');
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError('VALIDATION', `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
  }
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, actor.id));
}
