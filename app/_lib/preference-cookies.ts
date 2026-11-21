import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from '@/i18n/config';
import { cookieSecure } from '@/server/auth/cookie';
import { THEME_COOKIE } from '@/ui/theme';

const options = () => ({
  path: '/',
  sameSite: 'lax' as const,
  secure: cookieSecure(),
  maxAge: 365 * 24 * 60 * 60,
});

export async function writeLocaleCookie(locale: string): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, options());
}

export async function writeThemeCookie(theme: string): Promise<void> {
  (await cookies()).set(THEME_COOKIE, theme, options());
}
