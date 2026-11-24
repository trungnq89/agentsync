import { defaultTimezone, isValidTimezone } from '@/server/digest/timezone';

/**
 * Zone names offered in the pickers. `Intl.supportedValuesOf` lists legacy names (Asia/Saigon), so the
 * default and the currently stored values are added to keep them selectable; `UTC` is accepted too.
 */
export function timezoneOptions(...extra: (string | null | undefined)[]): string[] {
  const all = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC', defaultTimezone()]);
  for (const z of extra) if (z && isValidTimezone(z)) all.add(z);
  return [...all].sort();
}

/** `HH:MM` choices in 15 minute steps. */
export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
