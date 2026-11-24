'use client';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { sendTestDigestAction, setSlackEnabledAction } from '../../../_actions/slack';
import { withToast } from './with-toast';

const toggled = withToast(setSlackEnabledAction);

export function StatusCard({ enabled, canEnable }: { enabled: boolean; canEnable: boolean }) {
  const t = useTranslations('slack');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('statusTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={enabled ? 'success' : 'neutral'} data-testid="slack-status">
            {t(enabled ? 'statusOn' : 'statusOff')}
          </Badge>
          {enabled ? (
            <ActionForm action={toggled}>
              <input type="hidden" name="enabled" value="false" />
              <Button type="submit" variant="outline" size="sm">
                {t('disable')}
              </Button>
            </ActionForm>
          ) : (
            <ConfirmAction
              title={t('enableTitle')}
              description={t('enableDesc')}
              confirmLabel={t('enable')}
              tone="primary"
              action={toggled}
              trigger={
                <Button size="sm" disabled={!canEnable} data-testid="slack-enable">
                  {t('enable')}
                </Button>
              }
              fields={<input type="hidden" name="enabled" value="true" />}
            />
          )}
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">{t('testSendTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('testSendDesc')}</p>
          <ActionForm action={async () => sendTestDigestAction()} className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" disabled={!canEnable}>
              {t('testSend')}
            </Button>
          </ActionForm>
        </div>
      </CardContent>
    </Card>
  );
}
