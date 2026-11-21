'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { login, logout } from '@/server/auth/session';
import { run, str, type FormState } from '../_lib/action';
import { SESSION_COOKIE } from '../_lib/actor';

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const res = await run(async () => {
    const { sessionId } = await login(getDb(), str(form, 'username'), String(form.get('password') ?? ''));
    (await cookies()).set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
  });
  if (res.error) return res;
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await logout(getDb(), id);
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
