'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { LOCALE_COOKIE } from '@/i18n/config';
import { adoptCookieLocale } from '@/server/preferences';
import { cookieSecure } from '@/server/auth/cookie';
import { login, logout } from '@/server/auth/session';
import { run, str, type FormState } from '../_lib/action';
import { SESSION_COOKIE } from '../_lib/actor';
import { writeLocaleCookie, writeThemeCookie } from '../_lib/preference-cookies';

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const res = await run(async () => {
    const { sessionId, user } = await login(getDb(), str(form, 'username'), String(form.get('password') ?? ''));
    const jar = await cookies();
    jar.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure(),
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
    await adoptCookieLocale(getDb(), user, jar.get(LOCALE_COOKIE)?.value);
    // DB preferences win over whatever the browser had.
    if (user.locale) await writeLocaleCookie(user.locale);
    await writeThemeCookie(user.theme);
  });
  if (res.error || res.fieldErrors) return res;
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await logout(getDb(), id);
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
