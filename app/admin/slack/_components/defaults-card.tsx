'use client';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { saveSlackDefaultsAction } from '../../../_actions/slack';
import { DaysField, TimeField, TimezoneField } from '../../../_components/digest-fields';
import { withToast } from './with-toast';

const saved = withToast(saveSlackDefaultsAction);

export type DefaultsValues = { enabled: boolean; time: string; days: number[]; timezone: string };

export function DefaultsCard({ values, zones, locked }: { values: DefaultsValues; zones: string[]; locked: boolean }) {
  const t = useTranslations('slack');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('defaultsTitle')}</CardTitle>
        <CardDescription>{t('defaultsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saved} className="space-y-4" testId="slack-defaults-form">
          <fieldset disabled={locked} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="slack-default-enabled" name="enabled" defaultChecked={values.enabled} />
              <Label htmlFor="slack-default-enabled">{t('defaultEnabled')}</Label>
            </div>
            <TimeField label={t('time')} value={values.time} />
            <TimezoneField label={t('timezone')} value={values.timezone} zones={zones} hint={t('timezoneHint')} />
            <div className="sm:col-span-2">
              <DaysField label={t('days')} value={values.days} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{t('saveDefaults')}</Button>
            </div>
          </fieldset>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
