import type { Locale } from '@/i18n/config';
import { serverTranslator } from '@/i18n/translator';
import { VN_OFFSET_MS } from '@/server/clock';

const MIN = 60_000;
const HOUR = 60 * MIN;

const vnDay = (d: Date) => Math.floor((d.getTime() + VN_OFFSET_MS) / (24 * HOUR));

/**
 * Relative time via Intl.RelativeTimeFormat. Under a minute is the catalog "just now" (future dates too),
 * under a day counts minutes/hours, beyond that counts Vietnam calendar days.
 */
export function formatRelative(date: Date, now: Date, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = now.getTime() - date.getTime();
  if (diff < MIN) return serverTranslator(locale, 'common')('justNow');
  let out: string;
  if (diff < HOUR) out = rtf.format(-Math.floor(diff / MIN), 'minute');
  else if (diff < 24 * HOUR) out = rtf.format(-Math.floor(diff / HOUR), 'hour');
  else {
    const days = Math.max(1, vnDay(now) - vnDay(date));
    // "yesterday" for 1 day; beyond that always numeric ("2 days ago", not "the day before yesterday").
    out = (days >= 2 ? new Intl.RelativeTimeFormat(locale, { numeric: 'always' }) : rtf).format(-days, 'day');
  }
  return out.toLocaleLowerCase(locale);
}

/** Attention item with its date params formatted for the viewer's locale (MCP keeps ISO dates). */
export function localizeAttention<T extends { detailParams?: Record<string, string | number> }>(item: T, locale: Locale): T {
  if (!item.detailParams) return item;
  const params = { ...item.detailParams };
  for (const k of ['due', 'expected']) {
    const v = params[k];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) params[k] = formatDate(v, locale);
  }
  return { ...item, detailParams: params };
}

/** Short date for a `YYYY-MM-DD` string (calendar date, no timezone shift). */
export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
