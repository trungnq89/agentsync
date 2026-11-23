/** IANA zone names offered in the pickers; `UTC` is accepted by the server too. */
export function timezoneOptions(): string[] {
  const all = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
  return [...all].sort();
}

/** `HH:MM` choices in 15 minute steps. */
export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
