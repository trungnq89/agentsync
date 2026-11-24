'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { getMyDigestPrefs, resetMyDigestPrefs, setMyDigestPrefs, type DigestPrefs } from '@/server/digest/prefs';
import { rematchSlackUser, sendTestDigest, testSlackConnection } from '@/server/digest/schedule';
import { saveSlackSettings } from '@/server/digest/settings';
import { run, str, type FormState } from '../_lib/action';
import { getActor } from '../_lib/actor';

const ADMIN_PATH = '/admin/slack';

const daysOf = (form: FormData) => form.getAll('days').map((d) => Number(d));

export async function saveSlackTokenAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await saveSlackSettings(getDb(), actor, { botToken: String(form.get('botToken') ?? '') });
    revalidatePath(ADMIN_PATH);
    return { ok: (await getTranslations('slack'))('tokenSavedToast') };
  });
}

export async function testSlackConnectionAction(): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const { team, botName } = await testSlackConnection(getDb(), actor);
    return { ok: (await getTranslations('slack'))('testOk', { team, bot: botName }) };
  });
}

export async function setSlackEnabledAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const enabled = str(form, 'enabled') === 'true';
    await saveSlackSettings(getDb(), actor, { enabled });
    revalidatePath(ADMIN_PATH);
    const t = await getTranslations('slack');
    return { ok: t(enabled ? 'enabledToast' : 'disabledToast') };
  });
}

export async function saveSlackDefaultsAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await saveSlackSettings(getDb(), actor, {
      defaults: { enabled: form.get('enabled') === 'on', time: str(form, 'time'), days: daysOf(form), timezone: str(form, 'timezone') },
    });
    revalidatePath(ADMIN_PATH);
    return { ok: (await getTranslations('slack'))('defaultsSaved') };
  });
}

export async function sendTestDigestAction(): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await sendTestDigest(getDb(), actor);
    return { ok: (await getTranslations('slack'))('testSent') };
  });
}

export async function rematchSlackUserAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await rematchSlackUser(getDb(), actor, str(form, 'userId'));
    revalidatePath(ADMIN_PATH);
    return { ok: (await getTranslations('slack'))('rematchDone') };
  });
}

/** Saves only the fields that differ from what is in effect, so untouched fields keep following the company default. */
export async function saveMyDigestAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const db = getDb();
    const cur = await getMyDigestPrefs(db, actor);
    const next: DigestPrefs = {
      enabled: form.get('enabled') === 'on',
      time: str(form, 'time'),
      days: [...new Set(daysOf(form))].sort((a, b) => a - b),
      timezone: str(form, 'timezone'),
    };
    const changed: Partial<DigestPrefs> = {};
    if (next.enabled !== cur.enabled) changed.enabled = next.enabled;
    if (next.time !== cur.time) changed.time = next.time;
    if (next.days.join() !== cur.days.join()) changed.days = next.days;
    if (next.timezone !== cur.timezone) changed.timezone = next.timezone;
    // Validate the submitted values even when nothing differs (e.g. no day ticked on an inherited empty set).
    if (Object.keys(changed).length === 0 && next.enabled && next.days.length === 0) changed.days = [];
    await setMyDigestPrefs(db, actor, changed);
    revalidatePath('/settings');
    return { ok: (await getTranslations('digestPrefs'))('saved') };
  });
}

export async function resetMyDigestAction(): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await resetMyDigestPrefs(getDb(), actor);
    revalidatePath('/settings');
    return { ok: (await getTranslations('digestPrefs'))('defaultsRestored') };
  });
}
