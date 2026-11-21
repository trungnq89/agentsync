import { Circle, CircleCheck, CircleDot } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import type { PlanStep } from '@/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { formatRelative } from '../_lib/format';

const ICON = { todo: Circle, doing: CircleDot, done: CircleCheck } as const;
const LABEL = { todo: 'stepTodo', doing: 'stepDoing', done: 'stepDone' } as const;

export function PlanSummary({
  steps, history, now,
}: {
  steps: PlanStep[];
  history: { kind: string; reason: string | null; createdAt: Date }[];
  now: Date;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('task');
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const revisions = history.filter((h) => h.kind === 'revision');
  const latest = revisions[revisions.length - 1];
  return (
    <Card data-testid="plan-summary">
      <CardContent className="pt-4">
        <details className="group">
          <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 text-sm font-semibold">
            <span>{t('plan')}</span>
            <span className="font-normal text-muted-foreground">{t('planProgress', { done: doneCount, total: steps.length })}</span>
          </summary>
          <ol className="mt-3 space-y-1.5 text-sm">
            {steps.map((s, i) => {
              const Icon = ICON[s.status];
              return (
                <li key={i} className="flex gap-2">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.status === 'done' ? 'text-success' : 'text-muted-foreground'}`} aria-hidden />
                  <span className="sr-only">{t(LABEL[s.status])}:</span>
                  <span className={`min-w-0 break-words ${s.status === 'done' ? 'text-muted-foreground' : ''}`}>{s.title}</span>
                </li>
              );
            })}
          </ol>
        </details>
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
