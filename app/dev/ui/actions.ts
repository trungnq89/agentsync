'use server';
import { getTranslations } from 'next-intl/server';
import { str, type FormState } from '../../_lib/action';

/** Sample action for the /dev/ui showcase: empty name is a field error, otherwise ok. */
export async function demoAction(_prev: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations('dev');
  if (!str(form, 'name')) return { fieldErrors: { name: t('nameError') } };
  return { ok: t('saved') };
}

/** Succeeds with no message; used by the showcase's ConfirmAction. */
export async function noopAction(): Promise<FormState> {
  return {};
}
