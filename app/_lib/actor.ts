import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import type { User } from '@/db/schema';
import { getSessionUser } from '@/server/auth/session';

export const SESSION_COOKIE = 'ags_session';

export async function getOptionalActor(): Promise<User | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getSessionUser(getDb(), id);
}

/** Current user, or redirect to /login. */
export async function getActor(): Promise<User> {
  const user = await getOptionalActor();
  if (!user) redirect('/login');
  return user;
}

export async function getAdminActor(): Promise<User> {
  const user = await getActor();
  if (!user.isAdmin) redirect('/');
  return user;
}
