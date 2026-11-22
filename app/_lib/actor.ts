import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import type { User } from '@/db/schema';
import { getSessionUser } from '@/server/auth/session';

export const SESSION_COOKIE = 'ags_session';

/** Cached per request so layout and i18n config share one session lookup. */
export const getOptionalActor = cache(async (): Promise<User | null> => {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getSessionUser(getDb(), id);
});

export const MUST_CHANGE_URL = '/settings?mustChange=1';

/**
 * Current user, or redirect to /login. A user who must change their password is sent to
 * the settings page; only that page and its password action pass `allowMustChange`.
 */
export async function getActor(opts: { allowMustChange?: boolean } = {}): Promise<User> {
  const user = await getOptionalActor();
  if (!user) redirect('/login');
  if (user.mustChangePassword && !opts.allowMustChange) redirect(MUST_CHANGE_URL);
  return user;
}

export async function getAdminActor(): Promise<User> {
  const user = await getActor();
  if (!user.isAdmin) redirect('/');
  return user;
}
