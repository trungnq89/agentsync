import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { users } from '@/db/schema';
import { isLocale } from '@/i18n/config';
import { isTheme } from '@/ui/theme';
import type { Actor } from './authz';
import { DomainError } from './errors';

// The message carries the translation key until DomainError gains a dedicated key field.
const INVALID = 'errors.invalidPreference';

export async function setMyLocale(db: Db, actor: Actor, locale: string): Promise<void> {
  if (!isLocale(locale)) throw new DomainError('VALIDATION', INVALID);
  await db.update(users).set({ locale }).where(eq(users.id, actor.id));
}

export async function setMyTheme(db: Db, actor: Actor, theme: string): Promise<void> {
  if (!isTheme(theme)) throw new DomainError('VALIDATION', INVALID);
  await db.update(users).set({ theme }).where(eq(users.id, actor.id));
}
