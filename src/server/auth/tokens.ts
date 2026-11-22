import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { agentTokens, users, type AgentToken, type User } from '@/db/schema';
import { DomainError } from '../errors';
import { isUuid } from '../ids';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createAgentToken(
  db: Db,
  userId: string,
  label: string,
): Promise<{ token: string; record: AgentToken }> {
  const token = `ags_${randomBytes(32).toString('base64url')}`;
  const [record] = await db
    .insert(agentTokens)
    .values({ userId, label, tokenHash: sha256(token), prefix: token.slice(0, 8) })
    .returning();
  return { token, record };
}

export async function authenticateAgentToken(db: Db, bearer: string, now: Date = new Date()): Promise<User> {
  const hash = sha256(bearer);
  const [row] = await db
    .select({ token: agentTokens, user: users })
    .from(agentTokens)
    .innerJoin(users, eq(users.id, agentTokens.userId))
    .where(eq(agentTokens.tokenHash, hash));
  if (
    !row ||
    !timingSafeEqual(Buffer.from(row.token.tokenHash), Buffer.from(hash)) ||
    row.token.revokedAt ||
    row.user.disabledAt ||
    row.user.mustChangePassword
  ) {
    throw new DomainError('UNAUTHORIZED', 'badToken');
  }
  await db.update(agentTokens).set({ lastUsedAt: now }).where(eq(agentTokens.id, row.token.id));
  return row.user;
}

export async function revokeAgentToken(db: Db, actorId: string, tokenId: string): Promise<void> {
  if (!isUuid(tokenId)) throw new DomainError('NOT_FOUND', 'notFoundToken');
  const [row] = await db.select().from(agentTokens).where(eq(agentTokens.id, tokenId));
  if (!row) throw new DomainError('NOT_FOUND', 'notFoundToken');
  if (row.userId !== actorId) throw new DomainError('FORBIDDEN', 'tokenForbidden');
  if (!row.revokedAt) await db.update(agentTokens).set({ revokedAt: new Date() }).where(eq(agentTokens.id, tokenId));
}
