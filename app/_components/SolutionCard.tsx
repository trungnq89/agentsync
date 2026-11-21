import { useTranslations } from 'next-intl';
import type { SolutionSummary } from '@/server/tasks/activity';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { reviewAction } from '../_actions/task';

const FIELDS = [
  ['problem', 'problem'],
  ['solution', 'solutionText'],
  ['rejectedAlternatives', 'rejectedAlternatives'],
  ['keyChanges', 'keyChanges'],
  ['risks', 'risks'],
  ['testing', 'testing'],
] as const satisfies readonly (readonly [keyof SolutionSummary, string])[];

export function SolutionCard({
  taskId, solution, canReview,
}: {
  taskId: string;
  solution: SolutionSummary | undefined;
  canReview: boolean;
}) {
  const t = useTranslations('task');
  const tVerdict = useTranslations('verdict');
  const tAction = useTranslations('action');
  return (
    <Card data-testid="solution-card">
      <CardHeader><CardTitle>{t('solution')}</CardTitle></CardHeader>
      <CardContent>
        {!solution ? (
          <p className="text-sm text-muted-foreground">{t('noSolution')}</p>
        ) : (
          <dl className="space-y-3 text-sm">
            {FIELDS.map(([k, label]) => (
              <div key={k}>
                <dt className="text-xs font-semibold text-muted-foreground">{t(label)}</dt>
                <dd className="break-words whitespace-pre-wrap">{String(solution[k])}</dd>
              </div>
            ))}
            {solution.prUrl && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t('pullRequest')}</dt>
                <dd className="break-all">
                  <a href={solution.prUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{solution.prUrl}</a>
                </dd>
              </div>
            )}
          </dl>
        )}
        {canReview && (
          <div className="mt-4 flex flex-wrap items-start gap-2">
            <ActionForm action={reviewAction}>
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="verdict" value="approved" />
              <Button type="submit">{tVerdict('approved')}</Button>
            </ActionForm>
            <ConfirmAction
              title={tAction('reject_review')}
              description={t('reviewChangesDesc')}
              confirmLabel={t('sendRequest')}
              tone="primary"
              action={reviewAction}
              trigger={<Button variant="outline" data-testid="open-changes">{tVerdict('changes_needed')}</Button>}
              fields={
                <>
                  <input type="hidden" name="taskId" value={taskId} />
                  <input type="hidden" name="verdict" value="changes_needed" />
                  <FormField name="note" label={t('note')}><Textarea rows={3} /></FormField>
                </>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
