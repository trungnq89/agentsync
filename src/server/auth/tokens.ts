import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { agentTokens, users, type AgentToken, type User } from '@/db/schema';
import { DomainError } from '../errors';
import { isUuid } from '../ids';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export type TokenScope = 'member' | 'manager';
export const TOKEN_LIFETIMES = [30, 90, 180] as const;
export const DEFAULT_TOKEN_DAYS = 90;
const DAY_MS = 86_400_000;

export async function createAgentToken(
  db: Db,
  userId: string,
  label: string,
  opts: { scope?: TokenScope; days?: number } = {},
  now: Date = new Date(),
): Promise<{ token: string; record: AgentToken }> {
  const scope = opts.scope ?? 'member';
  const days = opts.days ?? DEFAULT_TOKEN_DAYS;
  if (!(TOKEN_LIFETIMES as readonly number[]).includes(days)) {
    throw new DomainError('VALIDATION', 'invalidTokenLifetime', { field: 'days' });
  }
  if (scope !== 'member' && scope !== 'manager') {
    throw new DomainError('VALIDATION', 'tokenScopeNotAllowed', { field: 'scope' });
  }
  if (scope === 'manager') {
    const [report] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.managerId, userId), isNull(users.disabledAt)))
      .limit(1);
    if (!report) throw new DomainError('VALIDATION', 'tokenScopeNotAllowed', { field: 'scope' });
  }
  const token = `ags_${randomBytes(32).toString('base64url')}`;
  const [record] = await db
    .insert(agentTokens)
    .values({
      userId, label, scope, tokenHash: sha256(token), prefix: token.slice(0, 8),
      expiresAt: new Date(now.getTime() + days * DAY_MS),
    })
    .returning();
  return { token, record };
}

export interface AuthenticatedToken {
  id: string;
  scope: TokenScope;
  expiresAt: Date;
  legacy: boolean;
  label: string;
}

export async function authenticateAgentToken(
  db: Db,
  bearer: string,
  now: Date = new Date(),
): Promise<{ user: User; token: AuthenticatedToken }> {
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
    row.token.expiresAt.getTime() <= now.getTime() ||
    row.user.disabledAt
  ) {
    throw new DomainError('UNAUTHORIZED', 'badToken');
  }
  if (row.user.mustChangePassword) throw new DomainError('UNAUTHORIZED', 'passwordChangeRequired');
  await db.update(agentTokens).set({ lastUsedAt: now }).where(eq(agentTokens.id, row.token.id));
  const t = row.token;
  return {
    user: row.user,
    token: { id: t.id, scope: t.scope, expiresAt: t.expiresAt, legacy: t.legacy, label: t.label },
  };
}

export async function revokeAgentToken(db: Db, actorId: string, tokenId: string): Promise<void> {
  if (!isUuid(tokenId)) throw new DomainError('NOT_FOUND', 'notFoundToken');
  const [row] = await db.select().from(agentTokens).where(eq(agentTokens.id, tokenId));
  if (!row) throw new DomainError('NOT_FOUND', 'notFoundToken');
  if (row.userId !== actorId) throw new DomainError('FORBIDDEN', 'tokenForbidden');
  if (!row.revokedAt) await db.update(agentTokens).set({ revokedAt: new Date() }).where(eq(agentTokens.id, tokenId));
}
