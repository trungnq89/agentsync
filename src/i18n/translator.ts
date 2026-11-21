import { createTranslator } from 'next-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import type { Locale } from './config';

const catalogs = { en, vi } as const;

/** Translator usable outside React (MCP route, tests). */
export function serverTranslator(locale: Locale, namespace?: string) {
  const messages = catalogs[locale];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createTranslator({ locale, messages, namespace } as any) as unknown as (
    key: string,
    values?: Record<string, string | number | Date>,
  ) => string;
}
