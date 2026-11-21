'use client';
import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FormField } from '@/components/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { THEMES, type Theme } from '@/ui/theme';
import { setLocaleAction, setThemeAction } from '../_actions/preferences';

/** Language and theme pickers; they reuse the shell's actions so persistence stays in one place. */
export function PreferencesForm({ theme }: { theme: Theme }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const tTheme = useTranslations('theme');
  const tn = useTranslations('nav');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<boolean>) =>
    startTransition(async () => {
      if (!(await fn())) toast.error(tn('preferenceFailed'));
    });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField name="language" label={t('language')}>
        <Select value={locale} onValueChange={(v) => run(() => setLocaleAction(v))} disabled={pending}>
          <SelectTrigger data-testid="settings-language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{tc('english')}</SelectItem>
            <SelectItem value="vi">{tc('vietnamese')}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField name="theme" label={t('theme')}>
        <Select value={theme} onValueChange={(v) => run(() => setThemeAction(v))} disabled={pending}>
          <SelectTrigger data-testid="settings-theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((v) => (
              <SelectItem key={v} value={v}>
                {tTheme(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </div>
  );
}
