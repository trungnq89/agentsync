'use client';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { saveConnectionAction, testConnectionAction } from '../../../_actions/odoo';

export type ConnectionValues = { url: string; database: string; login: string; hasApiKey: boolean; encryptionReady: boolean };

export function ConnectionCard({ values }: { values: ConnectionValues }) {
  const t = useTranslations('odoo');
  const locked = !values.encryptionReady;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('connectionTitle')}</CardTitle>
        <CardDescription>{t('connectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {locked && (
          <p role="alert" data-testid="odoo-key-missing" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
            {t('keyMissing')}
          </p>
        )}
        <ActionForm action={saveConnectionAction} className="space-y-4" testId="odoo-connection-form">
          <fieldset disabled={locked} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField name="url" label={t('url')} hint={t('urlHint')}>
              <Input type="url" autoComplete="off" defaultValue={values.url} required />
            </FormField>
            <FormField name="database" label={t('database')}>
              <Input autoComplete="off" defaultValue={values.database} required />
            </FormField>
            <FormField name="login" label={t('login')}>
              <Input autoComplete="off" defaultValue={values.login} required />
            </FormField>
            <FormField name="apiKey" label={t('apiKey')} hint={values.hasApiKey ? t('apiKeySavedHint') : t('apiKeyEmptyHint')}>
              <Input type="password" autoComplete="new-password" required={!values.hasApiKey} />
            </FormField>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit">{t('saveConnection')}</Button>
              {values.hasApiKey && <span className="text-sm text-success-foreground">{t('apiKeySaved')}</span>}
            </div>
          </fieldset>
        </ActionForm>
        <ActionForm
          action={testConnectionAction}
          className="flex flex-wrap items-center gap-3"
          render={(s) =>
            (s.ok || s.error) && (
              <p data-testid="odoo-test-result" className={s.error ? 'text-sm text-danger-foreground' : 'text-sm text-success-foreground'}>
                {s.ok ?? s.error}
              </p>
            )
          }
        >
          <Button type="submit" variant="outline" disabled={locked || !values.hasApiKey}>
            {t('testConnection')}
          </Button>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
