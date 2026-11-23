'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { setCheckpointConfirmer } from '@/server/tasks/confirm';
import { run, str, type FormState } from '../_lib/action';
import { getActor } from '../_lib/actor';

export async function setConfirmerAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  const userId = str(form, 'userId');
  const confirmer = str(form, 'confirmer') === 'manager' ? 'manager' : 'member';
  return run(async () => {
    await setCheckpointConfirmer(getDb(), actor, userId, confirmer);
    revalidatePath(`/people/${userId}`);
    revalidatePath('/');
    return { ok: (await getTranslations('person'))('toastConfirmerSaved') };
  });
}
