import { Circle, CircleCheck, CircleDot, Hourglass } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import type { PlanStep } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { reviewCheckpointAction } from '../_actions/task';
import { ApproveStepButton } from './ApproveStepButton';
import { PlanDetails } from './PlanDetails';
import { formatRelative } from '../_lib/format';

const ICON = { todo: Circle, doing: CircleDot, pending_approval: Hourglass, done: CircleCheck } as const;
const LABEL = { todo: 'stepTodo', doing: 'stepDoing', pending_approval: 'stepPending', done: 'stepDone' } as const;

export function PlanSummary({
  taskId, ownerName, steps, history, canReview, now,
}: {
  taskId: string;
  ownerName: string;
  steps: PlanStep[];
  history: { kind: string; reason: string | null; createdAt: Date }[];
  canReview: boolean;
  now: Date;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('task');
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const pendingCount = steps.filter((s) => s.status === 'pending_approval').length;
  const revisions = history.filter((h) => h.kind === 'revision');
  const latest = revisions[revisions.length - 1];
  return (
    <Card data-testid="plan-summary">
      <CardContent className="pt-4">
        <PlanDetails initialOpen={pendingCount > 0}>
          <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold">
            <span>{t('plan')}</span>
            <span className="font-normal text-muted-foreground">{t('planProgress', { done: doneCount, total: steps.length })}</span>
            {pendingCount > 0 && <Badge tone="info">{t('pendingSteps', { count: pendingCount })}</Badge>}
          </summary>
          <ol className="mt-3 space-y-2 text-sm">
            {steps.map((s, i) => {
              const Icon = ICON[s.status];
              const confirmedAt = s.confirmedAt ? new Date(s.confirmedAt) : null;
              return (
                <li key={i} data-testid="plan-step" data-status={s.status} className="flex gap-2">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.status === 'done' ? 'text-success' : s.status === 'pending_approval' ? 'text-info' : 'text-muted-foreground'}`} aria-hidden />
                  <span className="sr-only">{t(LABEL[s.status])}:</span>
                  <div className="min-w-0 flex-1">
                    <span className={`break-words ${s.status === 'done' ? 'text-muted-foreground' : ''}`}>{s.title}</span>
                    {s.status === 'pending_approval' && <Badge tone="info" className="ml-2 align-middle" aria-hidden="true">{t('stepPending')}</Badge>}
                    {s.status === 'done' && s.confirmedBy && (
                      <div className="text-xs text-muted-foreground" data-testid="step-confirmed">
                        {t('confirmedWhen', {
                          who: s.confirmedBy === 'manager' ? t('confirmedByManager') : t('confirmedByMember', { name: ownerName }),
                          when: confirmedAt ? formatRelative(confirmedAt, now, locale) : '',
                        })}
                      </div>
                    )}
                    {canReview && s.status === 'pending_approval' && (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <ApproveStepButton taskId={taskId} stepTitle={s.title} />
                        <ConfirmAction
                          title={t('rejectTitle')}
                          description={t('rejectDesc')}
                          confirmLabel={t('rejectSend')}
                          tone="primary"
                          action={reviewCheckpointAction}
                          trigger={<Button type="button" size="sm" variant="outline" aria-label={`${t('stepReject')}: ${s.title}`} data-testid="step-reject">{t('stepReject')}</Button>}
                          fields={
                            <>
                              <input type="hidden" name="taskId" value={taskId} />
                              <input type="hidden" name="stepTitle" value={s.title} />
                              <input type="hidden" name="decision" value="rejected" />
                              <FormField name="note" label={t('note')}><Textarea rows={3} aria-required="true" /></FormField>
                            </>
                          }
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {canReview && pendingCount > 0 && (
            <div className="mt-3">
              <ConfirmAction
                title={t('approveAllTitle')}
                description={t('approveAllDesc')}
                confirmLabel={t('approveAll')}
                tone="primary"
                action={reviewCheckpointAction}
                trigger={<Button type="button" size="sm" variant="outline" data-testid="approve-all">{t('approveAll')}</Button>}
                fields={
                  <>
                    <input type="hidden" name="taskId" value={taskId} />
                    <input type="hidden" name="decision" value="approved" />
                    <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="approve-all-steps">
                      {steps.filter((s) => s.status === 'pending_approval').map((s, i) => <li key={i} className="break-words">{s.title}</li>)}
                    </ul>
                  </>
                }
              />
            </div>
          )}
        </PlanDetails>
        {revisions.length > 0 && (
          <p className="mt-3 break-words text-xs text-muted-foreground">
            {t('planRevisions', { count: revisions.length })}
            {latest?.reason && <> · {t('planLatestReason', { reason: latest.reason })}</>}
            {latest && <> ({formatRelative(latest.createdAt, now, locale)})</>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
