import { getLocale } from 'next-intl/server';
import { defaultLocale, isLocale } from '@/i18n/config';
import { DomainError, translateError } from '@/server/errors';

export type FormState = {
  error?: string;
  ok?: string;
  token?: string;
  /** Per-field messages (VALIDATION errors carrying `params.field`). */
  fieldErrors?: Record<string, string>;
};

/** Runs a form action, turning DomainError into a message translated for the request locale. */
export async function run(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    if (e instanceof DomainError) {
      const current = await getLocale();
      const message = translateError(e, isLocale(current) ? current : defaultLocale());
      const field = e.code === 'VALIDATION' ? e.params?.field : undefined;
      return typeof field === 'string' ? { fieldErrors: { [field]: message } } : { error: message };
    }
    throw e;
  }
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
