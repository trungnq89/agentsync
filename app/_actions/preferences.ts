'use server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { isLocale } from '@/i18n/config';
import { setMyLocale, setMyTheme } from '@/server/preferences';
import { isTheme } from '@/ui/theme';
import { getOptionalActor } from '../_lib/actor';
import { writeLocaleCookie, writeThemeCookie } from '../_lib/preference-cookies';

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const user = await getOptionalActor();
  if (user) await setMyLocale(getDb(), user, locale);
  await writeLocaleCookie(locale);
  revalidatePath('/', 'layout');
}

export async function setThemeAction(theme: string): Promise<void> {
  if (!isTheme(theme)) return;
  const user = await getOptionalActor();
  if (user) await setMyTheme(getDb(), user, theme);
  await writeThemeCookie(theme);
  revalidatePath('/', 'layout');
}
