import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Confirmer } from '@/server/tasks/confirm';
import { setConfirmerAction } from '../_actions/people';

/** Direct manager only: who confirms this person's plan checkpoints. Hidden for everyone else. */
export function ConfirmerCard({ userId, value }: { userId: string; value: Confirmer }) {
  const t = useTranslations('person');
  const options = [
    ['member', t('confirmerMember')],
    ['manager', t('confirmerManager')],
  ] as const;
  return (
    <Card data-testid="confirmer-card" className="mb-4">
      <CardHeader>
        <CardTitle>{t('confirmerTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('confirmerHint')}</p>
      </CardHeader>
      <CardContent>
        <ActionForm action={setConfirmerAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('confirmerTitle')}</legend>
            {options.map(([v, label]) => (
              <label key={v} className="flex min-w-0 items-start gap-2 text-sm">
                <input type="radio" name="confirmer" value={v} defaultChecked={value === v} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                <span className="min-w-0 break-words">{label}</span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" size="sm">{t('confirmerSave')}</Button>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
