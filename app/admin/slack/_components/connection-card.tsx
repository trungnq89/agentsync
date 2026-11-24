'use client';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { saveSlackTokenAction, testSlackConnectionAction } from '../../../_actions/slack';
import { withToast } from './with-toast';

// The card remounts when the first token is saved, so the toast is raised in the wrapper.
const saveToken = withToast(saveSlackTokenAction);

export type ConnectionValues = { tokenSaved: boolean; encryptionReady: boolean; docs: { path: string; url: string | null } };

export function ConnectionCard({ values }: { values: ConnectionValues }) {
  const t = useTranslations('slack');
  const locked = !values.encryptionReady;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('connectionTitle')}</CardTitle>
        <CardDescription>{t('connectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {locked && (
          <p role="alert" data-testid="slack-key-missing" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
            {t('keyMissing')}
          </p>
        )}
        <ActionForm action={saveToken} className="space-y-4" testId="slack-token-form">
          <fieldset disabled={locked} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField name="botToken" label={t('botToken')} hint={values.tokenSaved ? t('botTokenSavedHint') : t('botTokenEmptyHint')}>
              <Input type="password" autoComplete="new-password" required={!values.tokenSaved} />
            </FormField>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit">{t('saveToken')}</Button>
              {values.tokenSaved && <span data-testid="slack-token-saved" className="text-sm text-success-foreground">{t('tokenSaved')}</span>}
            </div>
          </fieldset>
        </ActionForm>
        <ActionForm action={testSlackConnectionAction} className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={locked || !values.tokenSaved}>
            {t('testConnection')}
          </Button>
        </ActionForm>
        <div className="space-y-2 border-t border-border pt-4 text-sm" data-testid="slack-guide">
          <h3 className="font-medium">{t('guideTitle')}</h3>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            {(['guideStep1', 'guideStep2', 'guideStep3', 'guideStep4', 'guideStep5'] as const).map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ol>
          <p className="text-muted-foreground">
            {values.docs.url
              ? t.rich('help', {
                  link: (chunks) => (
                    <a href={values.docs.url!} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
                      {chunks}
                    </a>
                  ),
                })
              : t.rich('helpPath', { path: values.docs.path, code: (chunks) => <code className="rounded bg-surface-muted px-1">{chunks}</code> })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
