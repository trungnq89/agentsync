import { getLocale, getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionForm } from '@/components/ui/action-form';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { listMyTokens } from '@/server/account';
import { isTheme } from '@/ui/theme';
import { getActor } from '../_lib/actor';
import { changePasswordAction, revokeTokenAction, sendModeAction } from '../_actions/settings';
import { PreferencesForm } from '../_components/PreferencesForm';
import { TokenForm } from '../_components/token-form';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: `${t('title')} · AgentSync` };
}
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const actor = await getActor({ allowMustChange: true });
  const [t, tSendMode, tc, locale] = await Promise.all([
    getTranslations('settings'),
    getTranslations('sendMode'),
    getTranslations('common'),
    getLocale(),
  ]);
  const tokens = await listMyTokens(getDb(), actor);
  const mcpUrl = `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/mcp`;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>

      {actor.mustChangePassword && (
        <div role="alert" data-testid="must-change-notice" className="rounded-lg border border-warning bg-warning-soft p-4 text-warning-foreground">
          <p className="font-semibold">{t('mustChangeTitle')}</p>
          <p className="text-sm">{t('mustChangeDesc')}</p>
        </div>
      )}

      {!actor.mustChangePassword && (
        <>
      <Card>
        <CardHeader>
          <CardTitle>{t('preferences')}</CardTitle>
          <CardDescription>{t('preferencesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm theme={isTheme(actor.theme) ? actor.theme : 'system'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('sendModeTitle')}</CardTitle>
          <CardDescription>{t('sendModeDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={sendModeAction} className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="sr-only">{t('sendModeTitle')}</legend>
              {(['review', 'auto'] as const).map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <input
                    id={`send-mode-${m}`}
                    type="radio"
                    name="sendMode"
                    value={m}
                    defaultChecked={actor.sendMode === m}
                    className="h-4 w-4 accent-primary"
                  />
                  <Label htmlFor={`send-mode-${m}`}>{tSendMode(m)}</Label>
                </div>
              ))}
            </fieldset>
            <Button type="submit">{tc('save')}</Button>
          </ActionForm>
        </CardContent>
      </Card>

        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('passwordTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={changePasswordAction} className="max-w-sm space-y-4">
            <FormField name="current" label={t('currentPassword')}>
              <Input type="password" autoComplete="current-password" required />
            </FormField>
            <FormField name="next" label={t('newPassword')}>
              <Input type="password" autoComplete="new-password" required />
            </FormField>
            <FormField name="confirm" label={t('confirmPassword')}>
              <Input type="password" autoComplete="new-password" required />
            </FormField>
            <Button type="submit">{t('changePassword')}</Button>
          </ActionForm>
        </CardContent>
      </Card>


      {!actor.mustChangePassword && (
        <>
      <Card>
        <CardHeader>
          <CardTitle>{t('tokensTitle')}</CardTitle>
          <CardDescription>{t('tokensDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TokenForm mcpUrl={mcpUrl} />
          {tokens.length === 0 ? (
            <EmptyState title={t('noTokens')} />
          ) : (
            <ul className="space-y-2" data-testid="token-list">
              {tokens.map((tok) => (
                <li key={tok.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-medium">{tok.label}</div>
                    <div className="break-words text-muted-foreground">
                      <code>{tok.prefix}…</code> ·{' '}
                      {t('lastUsed', { when: tok.lastUsedAt ? fmt.format(tok.lastUsedAt) : t('neverUsed') })}
                    </div>
                  </div>
                  {tok.revokedAt ? (
                    <Badge tone="neutral">{t('revoked')}</Badge>
                  ) : (
                    <ConfirmAction
                      title={t('revokeTitle')}
                      description={t('revokeDesc', { label: tok.label })}
                      confirmLabel={t('revoke')}
                      tone="destructive"
                      action={revokeTokenAction}
                      trigger={<Button variant="outline" size="sm">{t('revoke')}</Button>}
                      fields={<input type="hidden" name="tokenId" value={tok.id} />}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </main>
  );
}
