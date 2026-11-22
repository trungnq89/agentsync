'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { changeMyPassword, setMySendMode } from '@/server/account';
import { createAgentToken, revokeAgentToken } from '@/server/auth/tokens';
import { DomainError } from '@/server/errors';
import { run, str, type FormState } from '../_lib/action';
import { cookies } from 'next/headers';
import { getActor, SESSION_COOKIE } from '../_lib/actor';

export async function createTokenAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const label = str(form, 'label');
    if (!label) throw new DomainError('VALIDATION', 'tokenLabelRequired', { field: 'label' });
    const { token } = await createAgentToken(getDb(), actor.id, label);
    revalidatePath('/settings');
    return { token };
  });
}

export async function revokeTokenAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await revokeAgentToken(getDb(), actor.id, str(form, 'tokenId'));
    revalidatePath('/settings');
    return { ok: (await getTranslations('settings'))('tokenRevoked') };
  });
}

export async function sendModeAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await setMySendMode(getDb(), actor, str(form, 'sendMode') as 'auto' | 'review');
    revalidatePath('/settings');
    return { ok: (await getTranslations('settings'))('sendModeSaved') };
  });
}

export async function changePasswordAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor({ allowMustChange: true });
  return run(async () => {
    const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
    const next = String(form.get('next') ?? '');
    if (next !== String(form.get('confirm') ?? '')) {
      throw new DomainError('VALIDATION', 'passwordMismatch', { field: 'confirm' });
    }
    await changeMyPassword(getDb(), actor, String(form.get('current') ?? ''), next, sessionId);
    return { ok: (await getTranslations('settings'))('passwordChanged') };
  });
}
