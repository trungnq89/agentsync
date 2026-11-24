'use client';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { rematchSlackUserAction } from '../../../_actions/slack';
import { withToast } from './with-toast';

const action = withToast(rematchSlackUserAction);

export function RematchButton({ userId }: { userId: string }) {
  const t = useTranslations('slack');
  return (
    <ActionForm action={action}>
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="outline" size="sm">
        {t('rematch')}
      </Button>
    </ActionForm>
  );
}
