import { defaultLocale, isLocale, type Locale } from './config';

/** First supported language by q-weight; `vi-VN` -> `vi`. */
export function parseAcceptLanguage(h: string | null | undefined): Locale | null {
  if (!h) return null;
  const items = h.split(',').map((part, index) => {
    const [tag, ...params] = part.trim().split(';');
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    return { lang: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, index };
  });
  items.sort((a, b) => b.q - a.q || a.index - b.index);
  for (const it of items) if (it.q > 0 && isLocale(it.lang)) return it.lang;
  return null;
}

export function resolveLocale(i: {
  user?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(i.user)) return i.user;
  if (isLocale(i.cookie)) return i.cookie;
  return parseAcceptLanguage(i.acceptLanguage) ?? defaultLocale();
}
