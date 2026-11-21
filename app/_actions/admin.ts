'use server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import type { User } from '@/db/schema';
import { createUser, setPassword, updateUser } from '@/server/org';
import { setStaleBusinessDays } from '@/server/settings';
import { DomainError } from '@/server/errors';
import { run, str, type FormState } from '../_lib/action';
import { getActor } from '../_lib/actor';

const level = (f: FormData) => str(f, 'level') as User['level'];

export async function createUserAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const username = str(form, 'username');
    const password = String(form.get('password') ?? '');
    if (!username || !password) throw new DomainError('VALIDATION', 'credentialsRequired');
    await createUser(getDb(), actor, {
      username,
      displayName: str(form, 'displayName') || username,
      password,
      level: level(form),
      managerId: str(form, 'managerId') || null,
      isAdmin: form.get('isAdmin') === 'on',
    });
    revalidatePath('/admin');
    return { ok: `Đã tạo người dùng ${username}.` };
  });
}

export async function updateUserAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await updateUser(getDb(), actor, str(form, 'userId'), {
      displayName: str(form, 'displayName'),
      level: level(form),
      managerId: str(form, 'managerId') || null,
      isAdmin: form.get('isAdmin') === 'on',
      disabled: form.get('disabled') === 'on',
    });
    revalidatePath('/admin');
    return { ok: 'Đã lưu.' };
  });
}

export async function resetPasswordAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const pw = String(form.get('password') ?? '');
    await setPassword(getDb(), actor, str(form, 'userId'), pw);
    return { ok: 'Đã đặt lại mật khẩu.' };
  });
}

export async function staleDaysAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await setStaleBusinessDays(getDb(), actor, Number(str(form, 'days')));
    revalidatePath('/admin');
    return { ok: 'Đã lưu.' };
  });
}
