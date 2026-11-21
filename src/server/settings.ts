import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { appSettings } from '@/db/schema';
import type { Actor } from './authz';
import { DomainError } from './errors';

export async function getStaleBusinessDays(db: Db): Promise<number> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return row?.staleBusinessDays ?? 3;
}

export async function setStaleBusinessDays(db: Db, actor: Actor, days: number): Promise<void> {
  if (!actor.isAdmin) throw new DomainError('FORBIDDEN', 'adminOnly');
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new DomainError('VALIDATION', 'staleDaysRange', { field: 'days' });
  }
  await db
    .insert(appSettings)
    .values({ id: 1, staleBusinessDays: days })
    .onConflictDoUpdate({ target: appSettings.id, set: { staleBusinessDays: days } });
}
