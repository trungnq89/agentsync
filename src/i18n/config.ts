export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];

export const NAMESPACES = [
  'common', 'nav', 'auth', 'home', 'person', 'task', 'settings', 'admin', 'odoo', 'status', 'health',
  'level', 'mode', 'attention', 'verdict', 'sendMode', 'action', 'errors', 'mcp', 'theme', 'dev', 'cli',
] as const;

export const LOCALE_COOKIE = 'locale';

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

let warned = false;

export function defaultLocale(): Locale {
  const v = process.env.DEFAULT_LOCALE;
  if (v === undefined || v === '') return 'en';
  if (isLocale(v)) return v;
  if (!warned) {
    warned = true;
    console.warn(`Invalid DEFAULT_LOCALE "${v}", falling back to "en".`);
  }
  return 'en';
}
