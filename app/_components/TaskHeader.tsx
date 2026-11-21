import type { Task } from '@/db/schema';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import type { TaskStatus } from '@/server/tasks/lifecycle';
import type { Health } from '@/server/tasks/health';
import { toneForHealth, toneForStatus } from '@/ui/tone';
import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FormField } from '@/components/ui/form-field';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { confirmAction, requestChangesAction } from '../_actions/task';
import { formatDate, formatRelative } from '../_lib/format';

const DAY_MS = 86_400_000;
const lateDays = (t: Task) =>
  t.expectedEndDate > t.agreedDueDate
    ? Math.round((Date.parse(t.expectedEndDate) - Date.parse(t.agreedDueDate)) / DAY_MS)
    : 0;

export function TaskHeader({
  task, ownerName, progress, health, lastActivityAt, canConfirm, now,
}: {
  task: Task;
  ownerName: string;
  progress: number;
  health: { health: string };
  lastActivityAt: Date;
  canConfirm: boolean;
  now: Date;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('task');
  const tStatus = useTranslations('status');
  const tHealth = useTranslations('health');
  const tAction = useTranslations('action');
  const late = lateDays(task);
  return (
    <Card className="space-y-3 p-4">
      <div className="min-w-0">
        <h1 className="break-words text-xl font-semibold tracking-tight">{task.title}</h1>
        <div className="mt-0.5 break-words text-sm text-muted-foreground">{ownerName}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge data-testid="task-status" tone={toneForStatus(task.status as TaskStatus)}>{tStatus(task.status)}</Badge>
        {health.health !== 'on_track' && (
          <Badge tone={toneForHealth(health.health as Health)}>{tHealth(health.health)}</Badge>
        )}
        <span className="text-muted-foreground">{t('expected', { date: formatDate(task.expectedEndDate, locale) })}</span>
        {late > 0 && <Badge tone="warning">{t('late', { count: late })}</Badge>}
      </div>
      <div className="flex items-center gap-3">
        <Progress value={progress} className="flex-1" aria-label={t('progress')} />
        <span data-testid="task-progress" className="text-sm font-semibold tabular-nums">{progress}%</span>
      </div>
      <div className="text-xs text-muted-foreground">{t('updated', { when: formatRelative(lastActivityAt, now, locale) })}</div>
      {canConfirm && (
        <div className="flex flex-wrap items-start gap-2 pt-1">
          <ActionForm action={confirmAction}>
            <input type="hidden" name="taskId" value={task.id} />
            <Button type="submit">{t('confirm')}</Button>
          </ActionForm>
          <ConfirmAction
            title={tAction('request_changes')}
            description={t('requestChangesDesc')}
            confirmLabel={t('sendRequest')}
            tone="primary"
            action={requestChangesAction}
            trigger={<Button variant="outline" data-testid="open-request-changes">{t('requestChanges')}</Button>}
            fields={
              <>
                <input type="hidden" name="taskId" value={task.id} />
                <FormField name="note" label={t('note')}><Textarea rows={3} aria-required="true" /></FormField>
              </>
            }
          />
        </div>
      )}
    </Card>
  );
}
