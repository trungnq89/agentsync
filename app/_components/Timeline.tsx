import Link from 'next/link';
import { vnDateString } from '@/server/clock';
import { useTranslations } from 'next-intl';
import type { TimelineTask } from '@/server/tasks/queries';
import { barSpan, computeAxis, position } from '../_lib/timeline';

const fmt = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

function colours(t: TimelineTask): { track: string; fill: string } {
  if (t.health === 'blocked') return { track: 'bg-red-500/25', fill: 'bg-red-500/60' };
  if (t.health === 'at_risk') return { track: 'bg-amber-500/25', fill: 'bg-amber-500/60' };
  if (t.status === 'done' || t.status === 'closed') return { track: 'bg-green-500/35', fill: 'bg-green-500/60' };
  return { track: 'bg-blue-500/20', fill: 'bg-blue-500/55' };
}

function rowStatus(t: TimelineTask, tStatus: (k: string) => string, tHealth: (k: string) => string): string {
  if (t.status === 'done' || t.status === 'closed') return '✅ Xong';
  if (t.health === 'blocked' || t.health === 'at_risk') return tHealth(t.health);
  return tStatus(t.status);
}

export function Timeline({ tasks, now = new Date() }: { tasks: TimelineTask[]; now?: Date }) {
  const tStatus = useTranslations('status');
  const tHealth = useTranslations('health');
  if (tasks.length === 0) return <p className="text-sm opacity-70">Chưa có việc nào để hiển thị.</p>;
  const todayStr = vnDateString(now);
  const axis = computeAxis(tasks, todayStr);
  const todayPct = position(todayStr, axis);
  const nearLeft = todayPct < 15;
  const nearRight = todayPct > 85;
  const todayStyle = nearLeft
    ? { left: `${todayPct}%` }
    : nearRight
      ? { right: `${100 - todayPct}%` }
      : { left: `${todayPct}%`, transform: 'translateX(-50%)' };

  return (
    <div data-testid="timeline">
      <div className="relative mb-2 h-4 overflow-hidden text-[10px] opacity-60 md:ml-44">
        {!nearLeft && <span className="absolute left-0">{fmt(axis.min)}</span>}
        <span className="absolute whitespace-nowrap" style={todayStyle}>Hôm nay {fmt(Date.parse(`${todayStr}T00:00:00Z`))}</span>
        {!nearRight && <span className="absolute right-0">{fmt(axis.max)}</span>}
      </div>
      <div className="relative">
        {tasks.map((t) => {
          const c = colours(t);
          const bar = barSpan(t.startDate, t.expectedEndDate, axis);
          const slipped = t.expectedEndDate > t.agreedDueDate;
          return (
            <Link
              key={t.id}
              href={`/tasks/${t.id}`}
              data-testid="timeline-row"
              className="block border-b border-dashed border-neutral-300 py-2 hover:bg-neutral-50 md:flex md:items-center dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              <div className="mb-1 min-w-0 md:mb-0 md:w-44 md:shrink-0 md:pr-2">
                <div className="truncate text-sm">{t.title}</div>
                <div className="text-[11px] opacity-70">{rowStatus(t, tStatus, tHealth)}</div>
              </div>
              <div className="relative h-[18px] w-full md:flex-1">
                <div
                  className={`absolute top-0.5 h-3.5 overflow-hidden rounded-full ${c.track}`}
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                >
                  <i className={`absolute inset-y-0 left-0 ${c.fill}`} style={{ width: `${Math.min(100, t.progress)}%` }} />
                </div>
                {slipped && (
                  <div
                    data-testid="timeline-agreed"
                    title={`Hạn thống nhất ${t.agreedDueDate}`}
                    className="absolute -bottom-0.5 -top-0.5 border-l-2 border-dashed border-neutral-500"
                    style={{ left: `${position(t.agreedDueDate, axis)}%` }}
                  />
                )}
              </div>
            </Link>
          );
        })}
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 md:left-44">
          <div
            data-testid="timeline-today"
            role="img"
            aria-label="Hôm nay"
            title="Hôm nay"
            className="absolute inset-y-0 w-0.5 bg-red-500"
            style={{ left: `${todayPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
