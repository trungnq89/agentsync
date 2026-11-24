// Dependency-free so client components can import it through app/_lib/timezones.

const FALLBACK_TIMEZONE = 'Asia/Ho_Chi_Minh';
const TZ_NAME_RE = /^[A-Z][A-Za-z0-9_+-]*(?:\/[A-Z][A-Za-z0-9_+-]*)+$/;

/**
 * Valid when the runtime can construct a formatter for it and it looks like an IANA name
 * (a capitalised Area/Location path: rejects raw offsets such as `+07:00`, abbreviations such as `EST`
 * and lower-case spellings, which Intl would otherwise accept). `Intl.supportedValuesOf` is not used: it lists legacy names only.
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz === '') return false;
  if (tz === 'UTC') return true;
  if (!TZ_NAME_RE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

let warned = false;
export function defaultTimezone(): string {
  const env = process.env.DEFAULT_TIMEZONE?.trim();
  if (!env) return FALLBACK_TIMEZONE;
  if (isValidTimezone(env)) return env;
  if (!warned) {
    warned = true;
    console.warn(`DEFAULT_TIMEZONE "${env}" is not a valid IANA time zone; using ${FALLBACK_TIMEZONE}`);
  }
  return FALLBACK_TIMEZONE;
}
