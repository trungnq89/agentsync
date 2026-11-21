import type { Locale } from '@/i18n/config';
import { VN_OFFSET_MS } from '@/server/clock';

const MIN = 60_000;
const HOUR = 60 * MIN;

const vnDay = (d: Date) => Math.floor((d.getTime() + VN_OFFSET_MS) / (24 * HOUR));

/**
 * Relative time via Intl.RelativeTimeFormat. Under a minute is "now" (future dates too),
 * under a day counts minutes/hours, beyond that counts Vietnam calendar days.
 */
export function formatRelative(date: Date, now: Date, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = now.getTime() - date.getTime();
  let out: string;
  if (diff < MIN) out = rtf.format(0, 'second');
  else if (diff < HOUR) out = rtf.format(-Math.floor(diff / MIN), 'minute');
  else if (diff < 24 * HOUR) out = rtf.format(-Math.floor(diff / HOUR), 'hour');
  else out = rtf.format(-Math.max(1, vnDay(now) - vnDay(date)), 'day');
  return out.toLocaleLowerCase(locale);
}

/** Short date for a `YYYY-MM-DD` string (calendar date, no timezone shift). */
export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
