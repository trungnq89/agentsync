import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { agentTokens, users, type AgentToken, type User } from '@/db/schema';
import { DomainError } from '../errors';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const BAD_TOKEN = 'Token không hợp lệ hoặc đã bị thu hồi.';

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
    row.user.disabledAt
  ) {
    throw new DomainError('UNAUTHORIZED', BAD_TOKEN);
  }
  await db.update(agentTokens).set({ lastUsedAt: now }).where(eq(agentTokens.id, row.token.id));
  return row.user;
}

export async function revokeAgentToken(db: Db, actorId: string, tokenId: string): Promise<void> {
  const [row] = await db.select().from(agentTokens).where(eq(agentTokens.id, tokenId));
  if (!row) throw new DomainError('NOT_FOUND', 'Không tìm thấy token.');
  if (row.userId !== actorId) throw new DomainError('FORBIDDEN', 'Bạn không có quyền thu hồi token này.');
  if (!row.revokedAt) await db.update(agentTokens).set({ revokedAt: new Date() }).where(eq(agentTokens.id, tokenId));
}
