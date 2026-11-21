import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { vnDateString } from '@/server/clock';
import type { TimelineTask } from '@/server/tasks/queries';
import { toneForHealth, toneForStatus, type Tone } from '@/ui/tone';
import { EmptyState } from '@/components/ui/empty-state';
import type { TaskStatus } from '@/server/tasks/lifecycle';
import type { Health } from '@/server/tasks/health';
import { barSpan, computeAxis, position } from '../_lib/timeline';

const fmt = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

// Bar fills use the solid token; the status text label next to each row keeps colour from being the only signal.
const BAR: Record<Tone, { track: string; fill: string }> = {
  neutral: { track: 'bg-surface-muted', fill: 'bg-muted-foreground' },
  primary: { track: 'bg-surface-muted', fill: 'bg-primary' },
  success: { track: 'bg-success-soft', fill: 'bg-success' },
  warning: { track: 'bg-warning-soft', fill: 'bg-warning' },
  danger: { track: 'bg-danger-soft', fill: 'bg-danger' },
  info: { track: 'bg-info-soft', fill: 'bg-info' },
};

const isDone = (t: TimelineTask) => t.status === 'done' || t.status === 'closed';
const isRisky = (t: TimelineTask) => t.health === 'blocked' || t.health === 'at_risk';

function rowTone(t: TimelineTask): Tone {
  if (isDone(t)) return 'success';
  if (isRisky(t)) return toneForHealth(t.health as Health);
  return toneForStatus(t.status as TaskStatus);
}

export function Timeline({ tasks, now = new Date() }: { tasks: TimelineTask[]; now?: Date }) {
  const tStatus = useTranslations('status');
  const tHealth = useTranslations('health');
  const t = useTranslations('person');
  if (tasks.length === 0) {
    return <EmptyState icon={<Inbox className="h-6 w-6" aria-hidden />} title={t('timelineEmpty')} />;
  }
  const rowStatus = (task: TimelineTask): string => {
    if (isDone(task)) return `✅ ${t('done')}`;
    if (isRisky(task)) return tHealth(task.health);
    return tStatus(task.status);
  };
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
  const todayLabel = t('todayWithDate', { date: fmt(Date.parse(`${todayStr}T00:00:00Z`)) });

  return (
    <div data-testid="timeline">
      <div className="relative mb-2 h-4 overflow-hidden text-[10px] text-muted-foreground md:ml-44">
        {!nearLeft && <span className="absolute left-0">{fmt(axis.min)}</span>}
        <span className="absolute whitespace-nowrap" style={todayStyle}>{todayLabel}</span>
        {!nearRight && <span className="absolute right-0">{fmt(axis.max)}</span>}
      </div>
      <div className="relative">
        {tasks.map((task) => {
          const c = BAR[rowTone(task)];
          const bar = barSpan(task.startDate, task.expectedEndDate, axis);
          const slipped = task.expectedEndDate > task.agreedDueDate;
          return (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              data-testid="timeline-row"
              className="block border-b border-dashed border-border py-2 hover:bg-surface-muted md:flex md:items-center"
            >
              <div className="mb-1 min-w-0 md:mb-0 md:w-44 md:shrink-0 md:pr-2">
                <div className="truncate text-sm" title={task.title}>{task.title}</div>
                <div className="text-[11px] text-muted-foreground">{rowStatus(task)}</div>
              </div>
              <div className="relative h-[18px] w-full md:flex-1">
                <div
                  className={`absolute top-0.5 h-3.5 overflow-hidden rounded-full ${c.track}`}
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                >
                  <i className={`absolute inset-y-0 left-0 ${c.fill}`} style={{ width: `${Math.min(100, task.progress)}%` }} />
                </div>
                {slipped && (
                  <div
                    data-testid="timeline-agreed"
                    title={t('agreedDue', { date: task.agreedDueDate })}
                    className="absolute -bottom-0.5 -top-0.5 border-l-2 border-dashed border-muted-foreground"
                    style={{ left: `${position(task.agreedDueDate, axis)}%` }}
                  />
                )}
                {/* Today line lives inside each bar area so it never crosses the row text (stacked on mobile). */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-danger"
                  style={{ left: `${todayPct}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
      <div className="relative mt-2 h-2 md:ml-44">
        <div
          data-testid="timeline-today"
          role="img"
          aria-label={t('today')}
          title={t('today')}
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-danger"
          style={{ left: `${todayPct}%` }}
        />
      </div>
    </div>
  );
}
