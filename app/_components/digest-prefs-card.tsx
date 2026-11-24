'use client';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { FormState } from '../_lib/action';
import { resetMyDigestAction, saveMyDigestAction } from '../_actions/slack';
import { DaysField, TimeField, TimezoneField } from './digest-fields';

export type DigestPrefsValues = {
  enabled: boolean;
  time: string;
  days: number[];
  timezone: string;
  inherited: { enabled: boolean; time: boolean; days: boolean; timezone: boolean };
  slackEnabled: boolean;
  slackLinked: boolean | null;
  /** Why the user is not matched, when known. */
  unmatchedReason: 'noEmail' | 'slackUserNotFound' | null;
};

// The card remounts from the saved values after a save, so the toast is raised here (see admin withToast).
const withToast = (action: (p: FormState, f: FormData) => Promise<FormState>) => async (p: FormState, f: FormData) => {
  const res = await action(p, f);
  if (res.ok) {
    toast.success(res.ok);
    return { ...res, ok: undefined };
  }
  return res;
};
const saved = withToast(saveMyDigestAction);
const resetAction = withToast(async () => resetMyDigestAction());

export function DigestPrefsCard({ values, zones }: { values: DigestPrefsValues; zones: string[] }) {
  const t = useTranslations('digestPrefs');
  const locked = !values.slackEnabled;
  const anyOverride = Object.values(values.inherited).some((v) => !v);
  const inh = (key: keyof DigestPrefsValues['inherited'], label: string) => (
    <>
      {label}
      {values.inherited[key] && (
        <span data-testid={`digest-inherited-${key}`} className="ml-1.5 text-xs font-normal text-muted-foreground">
          {t('inherited')}
        </span>
      )}
    </>
  );
  const formKey = JSON.stringify([values.enabled, values.time, values.days, values.timezone]);
  return (
    <Card data-testid="digest-prefs-card">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {locked && (
          <p data-testid="digest-slack-off" className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
            {t('slackOff')}
          </p>
        )}
        {!locked && values.slackLinked !== true && values.unmatchedReason && (
          <div role="alert" data-testid="digest-not-linked" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
            <p className="font-medium">{t('notLinkedTitle')}</p>
            <p>{t(values.unmatchedReason === 'noEmail' ? 'notLinkedNoEmail' : 'notLinkedNotFound')}</p>
          </div>
        )}
        <ActionForm action={saved} className="space-y-4" testId="digest-prefs-form" key={formKey}>
          <fieldset disabled={locked} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="digest-enabled" name="enabled" defaultChecked={values.enabled} />
              <Label htmlFor="digest-enabled">{inh('enabled', t('enabled'))}</Label>
            </div>
            <TimeField label={inh('time', t('time'))} value={values.time} />
            <TimezoneField label={inh('timezone', t('timezone'))} value={values.timezone} zones={zones} />
            <div className="sm:col-span-2">
              <DaysField label={inh('days', t('days'))} value={values.days} />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit">{t('save')}</Button>
            </div>
          </fieldset>
        </ActionForm>
        {anyOverride && (
          <ActionForm action={resetAction} className="flex">
            <Button type="submit" variant="outline" size="sm" disabled={locked}>
              {t('useDefaults')}
            </Button>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
