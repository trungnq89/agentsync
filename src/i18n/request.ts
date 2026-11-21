import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getOptionalActor } from '../../app/_lib/actor';
import { LOCALE_COOKIE } from './config';
import { resolveLocale } from './resolve';

export default getRequestConfig(async () => {
  const [user, cookieStore, headerStore] = await Promise.all([getOptionalActor(), cookies(), headers()]);
  const locale = resolveLocale({
    user: user?.locale,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
