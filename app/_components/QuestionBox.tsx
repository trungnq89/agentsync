import { useLocale } from 'next-intl';
import type { Locale } from '@/i18n/config';
import type { Question } from '@/server/tasks/activity';
import { answerAction, askAction } from '../_actions/task';
import { formatRelative } from '../_lib/format';
import { ActionForm, button, input } from './ui';

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
  const open = questions.filter((q) => q.status !== 'resolved');
  const canAnswer = (q: Question) =>
    q.direction === 'manager_to_member' ? viewerId === ownerId : isCurrentManager;
  return (
    <section data-testid="question-box" className="space-y-3">
      <h2 className="text-sm font-medium">Vướng mắc / câu hỏi</h2>
      {open.length === 0 && <p className="text-sm opacity-60">Không có câu hỏi đang mở.</p>}
      {open.map((q) => (
        <div key={q.id} data-testid="question" className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <div className="break-words whitespace-pre-wrap">
            {q.isBlocker && <span className="mr-1 text-red-600 dark:text-red-400">[Kẹt]</span>}
            {q.body}
          </div>
          <div className="mt-1 text-xs opacity-60">
            {q.direction === 'manager_to_member' ? 'Quản lý hỏi' : `${ownerName} hỏi`} · {formatRelative(q.createdAt, now, locale)}
          </div>
          {q.status === 'answered' && q.answer && (
            <div data-testid="answer" className="mt-2 border-l-2 border-neutral-300 pl-3 dark:border-neutral-700">
              <div className="break-words whitespace-pre-wrap">{q.answer}</div>
              <div className="mt-1 text-xs opacity-60">
                {q.answeredById === q.authorId ? 'Người hỏi' : q.direction === 'manager_to_member' ? ownerName : 'Quản lý'} đã trả lời
                {q.answeredAt && <> · {formatRelative(q.answeredAt, now, locale)}</>}
              </div>
            </div>
          )}
          {q.status === 'open' && canAnswer(q) && (
            <ActionForm action={answerAction} className="mt-2 space-y-2">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="questionId" value={q.id} />
              <label className="block text-xs">
                Trả lời
                <textarea name="answer" required rows={2} className={`${input} mt-1`} />
              </label>
              <button className={button}>Gửi trả lời</button>
            </ActionForm>
          )}
        </div>
      ))}
      {isCurrentManager && (
        <ActionForm action={askAction} className="space-y-2">
          <input type="hidden" name="taskId" value={taskId} />
          <label className="block text-sm">
            Đặt câu hỏi cho {ownerName}
            <textarea name="body" required rows={2} className={`${input} mt-1`} />
          </label>
          <button className={button}>Gửi câu hỏi</button>
        </ActionForm>
      )}
    </section>
  );
}
