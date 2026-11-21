import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import { vnDateString } from '@/server/clock';
import type { TimelineTask } from '@/server/tasks/queries';
import { toneForHealth, toneForStatus, type Tone } from '@/ui/tone';
import { EmptyState } from '@/components/ui/empty-state';
import type { TaskStatus } from '@/server/tasks/lifecycle';
import type { Health } from '@/server/tasks/health';
import { formatDate } from '../_lib/format';
import { barSpan, computeAxis, position } from '../_lib/timeline';

const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Tracks are outlined with the solid tone (>= 3:1 vs background, see tokens.test.ts) so the span stays visible;
// the status text label next to each row keeps colour from being the only signal.
const BAR: Record<Tone, { track: string; fill: string }> = {
  neutral: { track: 'bg-surface-muted ring-1 ring-muted-foreground', fill: 'bg-muted-foreground' },
  primary: { track: 'bg-surface-muted ring-1 ring-primary', fill: 'bg-primary' },
  success: { track: 'bg-success-soft ring-1 ring-success', fill: 'bg-success' },
  warning: { track: 'bg-warning-soft ring-1 ring-warning', fill: 'bg-warning' },
  danger: { track: 'bg-danger-soft ring-1 ring-danger', fill: 'bg-danger' },
  info: { track: 'bg-info-soft ring-1 ring-info', fill: 'bg-info' },
};
const TODAY_LINE = 'bg-foreground shadow-[0_0_0_1px_var(--background)]';

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
  const locale = useLocale() as Locale;
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
  const todayLabel = t('todayWithDate', { date: formatDate(todayStr, locale) });

  return (
    <div data-testid="timeline">
      <div className="relative mb-2 h-4 overflow-hidden text-[10px] text-muted-foreground md:ml-44">
        {!nearLeft && <span className="absolute left-0 hidden sm:inline">{formatDate(isoOf(axis.min), locale)}</span>}
        <span className="absolute whitespace-nowrap" style={todayStyle}>{todayLabel}</span>
        {!nearRight && <span className="absolute right-0 hidden sm:inline">{formatDate(isoOf(axis.max), locale)}</span>}
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
                    title={t('agreedDue', { date: formatDate(task.agreedDueDate, locale) })}
                    className="absolute -bottom-0.5 -top-0.5 border-l-2 border-dashed border-muted-foreground"
                    style={{ left: `${position(task.agreedDueDate, axis)}%` }}
                  />
                )}
                {/* Today line lives inside each bar area so it never crosses the row text (stacked on mobile). */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 w-0.5 ${TODAY_LINE}`}
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
          className={`absolute inset-y-0 w-0.5 -translate-x-1/2 ${TODAY_LINE}`}
          style={{ left: `${todayPct}%` }}
        />
      </div>
    </div>
  );
}
