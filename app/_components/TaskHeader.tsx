import type { Task } from '@/db/schema';
import { healthLabel, statusLabel } from '@/server/labels';
import { confirmAction, requestChangesAction } from '../_actions/task';
import { relativeTime } from '../_lib/relative-time';
import { ActionForm, button, buttonQuiet, input } from './ui';

const DAY_MS = 86_400_000;
const fmt = (iso: string) => iso.split('-').reverse().join('/');
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
  const late = lateDays(task);
  return (
    <header>
      <h1 className="text-xl font-semibold break-words">{task.title}</h1>
      <div className="mt-1 text-sm opacity-70">{ownerName}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span data-testid="task-status" className="rounded-full border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
          {statusLabel(task.status)}
        </span>
        {health.health !== 'on_track' && <span className="opacity-80">{healthLabel(health.health)}</span>}
        <span data-testid="task-progress">{progress}%</span>
        <span className="opacity-80">
          Dự kiến {fmt(task.expectedEndDate)}
          {late > 0 && <span className="text-red-600 dark:text-red-400"> · trễ {late} ngày</span>}
        </span>
      </div>
      <div className="mt-1 text-xs opacity-60">Cập nhật {relativeTime(lastActivityAt, now)}</div>
      {canConfirm && (
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <ActionForm action={confirmAction}>
            <input type="hidden" name="taskId" value={task.id} />
            <button className={button}>Xác nhận</button>
          </ActionForm>
          <details data-testid="changes-box" className="w-full sm:w-auto">
            <summary className={`${buttonQuiet} inline-block cursor-pointer`}>Yêu cầu sửa</summary>
            <ActionForm action={requestChangesAction} className="mt-2 space-y-2">
              <input type="hidden" name="taskId" value={task.id} />
              <label className="block text-sm">
                Ghi chú
                <textarea name="note" required rows={3} className={`${input} mt-1`} />
              </label>
              <button className={button}>Gửi yêu cầu sửa</button>
            </ActionForm>
          </details>
        </div>
      )}
    </header>
  );
}
