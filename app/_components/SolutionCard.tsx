import type { SolutionSummary } from '@/server/tasks/activity';
import { reviewAction } from '../_actions/task';
import { ActionForm, button, buttonQuiet, card, input } from './ui';

const FIELDS: [keyof SolutionSummary, string][] = [
  ['problem', 'Vấn đề'],
  ['solution', 'Giải pháp'],
  ['rejectedAlternatives', 'Phương án đã loại'],
  ['keyChanges', 'Thay đổi chính'],
  ['risks', 'Rủi ro'],
  ['testing', 'Kiểm thử'],
];

export function SolutionCard({
  taskId, solution, canReview,
}: {
  taskId: string;
  solution: SolutionSummary | undefined;
  canReview: boolean;
}) {
  return (
    <section data-testid="solution-card" className={card}>
      <h2 className="text-sm font-medium">Tóm tắt giải pháp</h2>
      {!solution ? (
        <p className="mt-2 text-sm opacity-60">Chưa có tóm tắt giải pháp.</p>
      ) : (
        <dl className="mt-2 space-y-2 text-sm">
          {FIELDS.map(([k, label]) => (
            <div key={k}>
              <dt className="text-xs opacity-60">{label}</dt>
              <dd className="break-words whitespace-pre-wrap">{String(solution[k])}</dd>
            </div>
          ))}
          {solution.prUrl && (
            <div>
              <dt className="text-xs opacity-60">Pull request</dt>
              <dd className="break-all">
                <a href={solution.prUrl} target="_blank" rel="noreferrer" className="underline">{solution.prUrl}</a>
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
            <button className={button}>Đã review, ổn</button>
          </ActionForm>
          <details className="w-full sm:w-auto">
            <summary data-testid="open-changes" className={`${buttonQuiet} inline-block cursor-pointer`}>Cần sửa</summary>
            <ActionForm action={reviewAction} className="mt-2 space-y-2">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="verdict" value="changes_needed" />
              <label className="block text-sm">
                Ghi chú
                <textarea name="note" required rows={3} className={`${input} mt-1`} />
              </label>
              <button className={button}>Gửi yêu cầu sửa</button>
            </ActionForm>
          </details>
        </div>
      )}
    </section>
  );
}
