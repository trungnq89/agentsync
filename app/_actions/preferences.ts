'use server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { isLocale } from '@/i18n/config';
import { setMyLocale, setMyTheme } from '@/server/preferences';
import { isTheme } from '@/ui/theme';
import { getOptionalActor } from '../_lib/actor';
import { writeLocaleCookie, writeThemeCookie } from '../_lib/preference-cookies';

/** Both actions resolve to true on success, false on any failure (the UI shows a translated toast). */
export async function setLocaleAction(locale: string): Promise<boolean> {
  try {
    if (!isLocale(locale)) return false;
    const user = await getOptionalActor();
    if (user) await setMyLocale(getDb(), user, locale);
    await writeLocaleCookie(locale);
    revalidatePath('/', 'layout');
    return true;
  } catch {
    return false;
  }
}

export async function setThemeAction(theme: string): Promise<boolean> {
  try {
    if (!isTheme(theme)) return false;
    const user = await getOptionalActor();
    if (user) await setMyTheme(getDb(), user, theme);
    await writeThemeCookie(theme);
    revalidatePath('/', 'layout');
    return true;
  } catch {
    return false;
  }
}
