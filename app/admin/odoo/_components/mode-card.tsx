'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { saveModeAction } from '../../../_actions/odoo';

const MODES = ['review', 'full', 'incremental'] as const;
const SCHEDULES = [0, 1, 6, 24] as const;
type Mode = (typeof MODES)[number];

const MODE_KEY = { review: 'modeReview', full: 'modeFull', incremental: 'modeIncremental' } as const;
const MODE_DESC = { review: 'modeReviewDesc', full: 'modeFullDesc', incremental: 'modeIncrementalDesc' } as const;

export function ModeCard({ mode: initial, scheduleHours }: { mode: Mode; scheduleHours: number }) {
  const t = useTranslations('odoo');
  const [mode, setMode] = useState<Mode>(initial);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('modeTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={saveModeAction} className="grid gap-4 sm:grid-cols-2" testId="odoo-mode-form">
          <FormField name="mode" label={t('mode')} hint={t(MODE_DESC[mode])}>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(MODE_KEY[m])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {mode === 'incremental' && (
            <FormField name="scheduleHours" label={t('schedule')}>
              <Select defaultValue={String(scheduleHours)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULES.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h === 0 ? t('scheduleOff') : t('scheduleHours', { hours: h })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <div className="sm:col-span-2">
            <Button type="submit">{t('saveMode')}</Button>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
