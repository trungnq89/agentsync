import { DomainError } from '@/server/errors';

export type FormState = { error?: string; ok?: string; token?: string };

/** Runs a form action, turning DomainError into a form-level message. */
export async function run(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
