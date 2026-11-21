import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import type { Question } from '@/server/tasks/activity';
import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { answerAction, askAction } from '../_actions/task';
import { formatRelative } from '../_lib/format';

export function QuestionBox({
  taskId, ownerId, ownerName, viewerId, isCurrentManager, questions, now,
}: {
  taskId: string;
  ownerId: string;
  ownerName: string;
  viewerId: string;
  isCurrentManager: boolean;
  questions: Question[];
  now: Date;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('task');
  const open = questions.filter((q) => q.status !== 'resolved');
  const canAnswer = (q: Question) =>
    q.direction === 'manager_to_member' ? viewerId === ownerId : isCurrentManager;
  const answerer = (q: Question) =>
    q.answeredById === q.authorId
      ? t('answeredByAsker')
      : q.direction === 'manager_to_member'
        ? t('answeredByName', { name: ownerName })
        : t('answeredByManager');
  return (
    <Card data-testid="question-box">
      <CardHeader><CardTitle>{t('questions')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {open.length === 0 && <p className="text-sm text-muted-foreground">{t('noQuestions')}</p>}
        {open.map((q) => (
          <div
            key={q.id}
            data-testid="question"
            className={`rounded-md border p-3 text-sm ${q.isBlocker ? 'border-danger' : 'border-border'}`}
          >
            <div className="break-words whitespace-pre-wrap">
              {q.isBlocker && <Badge tone="danger" className="mr-1.5 align-middle">{t('blocker')}</Badge>}
              {q.body}
            </div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              {q.direction === 'manager_to_member' ? t('managerAsked') : t('ownerAsked', { name: ownerName })} · {formatRelative(q.createdAt, now, locale)}
            </div>
            {q.status === 'answered' && q.answer && (
              <div data-testid="answer" className="mt-2 border-l-2 border-border pl-3">
                <div className="break-words whitespace-pre-wrap">{q.answer}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {answerer(q)}
                  {q.answeredAt && <> · {formatRelative(q.answeredAt, now, locale)}</>}
                </div>
              </div>
            )}
            {q.status === 'open' && canAnswer(q) && (
              <ActionForm action={answerAction} className="mt-3 space-y-2">
                <input type="hidden" name="taskId" value={taskId} />
                <input type="hidden" name="questionId" value={q.id} />
                <FormField name="answer" label={t('answer')}><Textarea rows={2} required /></FormField>
                <Button type="submit" size="sm">{t('sendAnswer')}</Button>
              </ActionForm>
            )}
          </div>
        ))}
        {isCurrentManager && (
          <ActionForm action={askAction} className="space-y-2">
            <input type="hidden" name="taskId" value={taskId} />
            <FormField name="body" label={t('askLabel', { name: ownerName })}><Textarea rows={2} required /></FormField>
            <Button type="submit" size="sm">{t('sendQuestion')}</Button>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
