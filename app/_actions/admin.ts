'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import type { User } from '@/db/schema';
import { createUser, setPassword, updateUser } from '@/server/org';
import { setStaleBusinessDays } from '@/server/settings';
import { DomainError } from '@/server/errors';
import { run, str, type FormState } from '../_lib/action';
import { getActor } from '../_lib/actor';

const level = (f: FormData) => str(f, 'level') as User['level'];
/** The manager Select cannot hold an empty value, so "no manager" arrives as 'none'. */
const managerId = (f: FormData) => {
  const v = str(f, 'managerId');
  return v && v !== 'none' ? v : null;
};

export async function createUserAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const username = str(form, 'username');
    const password = String(form.get('password') ?? '');
    if (!username) throw new DomainError('VALIDATION', 'credentialsRequired', { field: 'username' });
    if (!password) throw new DomainError('VALIDATION', 'credentialsRequired', { field: 'password' });
    await createUser(getDb(), actor, {
      username,
      displayName: str(form, 'displayName') || username,
      password,
      level: level(form),
      managerId: managerId(form),
      isAdmin: form.get('isAdmin') === 'on',
      email: str(form, 'email'),
    });
    revalidatePath('/admin');
    return { ok: (await getTranslations('admin'))('userCreated', { username }) };
  });
}

export async function updateUserAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await updateUser(getDb(), actor, str(form, 'userId'), {
      displayName: str(form, 'displayName'),
      level: level(form),
      managerId: managerId(form),
      isAdmin: form.get('isAdmin') === 'on',
      email: str(form, 'email'),
    });
    revalidatePath('/admin');
    return { ok: (await getTranslations('admin'))('userSaved') };
  });
}

export async function resetPasswordAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const pw = String(form.get('password') ?? '');
    await setPassword(getDb(), actor, str(form, 'userId'), pw);
    return { ok: (await getTranslations('admin'))('passwordReset') };
  });
}

export async function staleDaysAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await setStaleBusinessDays(getDb(), actor, Number(str(form, 'days')));
    revalidatePath('/admin');
    return { ok: (await getTranslations('admin'))('staleSaved') };
  });
}

/** Disables (`disabled=true`) or re-enables (`disabled=false`) a user. */
export async function setUserDisabledAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const disabled = str(form, 'disabled') === 'true';
    await updateUser(getDb(), actor, str(form, 'userId'), { disabled });
    revalidatePath('/admin');
    return { ok: (await getTranslations('admin'))(disabled ? 'userDisabled' : 'userEnabled') };
  });
}
