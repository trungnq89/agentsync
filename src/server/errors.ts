import type { Locale } from '@/i18n/config';
import { serverTranslator } from '@/i18n/translator';

export type DomainErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'EDIT_WINDOW_CLOSED'
  | 'VALIDATION'
  | 'UNAUTHORIZED';

export type ErrorParams = Record<string, string | number>;

/**
 * Business-rule error. Carries a translation key (namespace `errors`) and params;
 * `message` is the key (for logs only). Use `translateError` for display text.
 */
export class DomainError extends Error {
  code: DomainErrorCode;
  key: string;
  params?: ErrorParams;
  constructor(code: DomainErrorCode, key: string, params?: ErrorParams) {
    super(key);
    this.name = 'DomainError';
    this.code = code;
    this.key = key;
    this.params = params;
  }
}

/** Params holding enum ids that are shown as translated labels. */
const LABELLED_PARAMS = ['status', 'action'] as const;

export function translateError(e: DomainError, locale: Locale): string {
  const params: ErrorParams = { ...e.params };
  for (const name of LABELLED_PARAMS) {
    const v = params[name];
    if (typeof v === 'string') params[name] = serverTranslator(locale, name)(v);
  }
  return serverTranslator(locale, 'errors')(e.key, params);
}
