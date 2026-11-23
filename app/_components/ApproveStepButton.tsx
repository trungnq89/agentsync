'use client';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reviewCheckpointAction } from '../_actions/task';

/**
 * Approves one step. The step list re-renders without this button once the step is handled, which would
 * unmount an ActionForm before its toast effect ran, so the toast is raised directly from the handler.
 */
export function ApproveStepButton({ taskId, stepTitle }: { taskId: string; stepTitle: string }) {
  const t = useTranslations('task');
  const [pending, start] = useTransition();
  const onClick = () =>
    start(async () => {
      const form = new FormData();
      form.set('taskId', taskId);
      form.set('stepTitle', stepTitle);
      form.set('decision', 'approved');
      const res = await reviewCheckpointAction({}, form);
      if (res.error) toast.error(res.error);
      else if (res.info) toast.info(res.info);
      else if (res.ok) toast.success(res.ok);
    });
  return (
    <Button type="button" size="sm" aria-label={`${t('stepApprove')}: ${stepTitle}`} disabled={pending} onClick={onClick} data-testid="step-approve">
      {t('stepApprove')}
    </Button>
  );
}
