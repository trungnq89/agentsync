import { getLocale } from 'next-intl/server';
import { defaultLocale, isLocale } from '@/i18n/config';
import { DomainError, translateError } from '@/server/errors';

export type FormState = {
  error?: string;
  ok?: string;
  /** Neutral, non-error notice (e.g. the action was already done); raises an info toast. */
  info?: string;
  token?: string;
  /** Per-field messages (VALIDATION errors carrying `params.field`). */
  fieldErrors?: Record<string, string>;
};

/** Translated message of a DomainError for the request locale; any other error is rethrown. */
export async function domainMessage(e: unknown): Promise<{ message: string; field?: string }> {
  if (!(e instanceof DomainError)) throw e;
  const current = await getLocale();
  const message = translateError(e, isLocale(current) ? current : defaultLocale());
  const field = e.code === 'VALIDATION' ? e.params?.field : undefined;
  return { message, field: typeof field === 'string' ? field : undefined };
}

/** Runs a form action, turning DomainError into a message translated for the request locale. */
export async function run(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    const { message, field } = await domainMessage(e);
    return field ? { fieldErrors: { [field]: message } } : { error: message };
  }
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
