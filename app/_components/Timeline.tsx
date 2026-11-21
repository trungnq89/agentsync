import Link from 'next/link';
import type { TimelineTask } from '@/server/tasks/queries';

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const vnToday = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
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

export function Timeline({ tasks, now = new Date() }: { tasks: TimelineTask[]; now?: Date }) {
  if (tasks.length === 0) return <p className="text-sm opacity-70">Chưa có việc nào để hiển thị.</p>;
  const today = ms(vnToday(now));
  const min = Math.min(today, ...tasks.map((t) => ms(t.startDate))) - 3 * DAY;
  const max = Math.max(today, ...tasks.map((t) => ms(t.expectedEndDate))) + 7 * DAY;
  const span = max - min;
  const pct = (t: number) => `${(((t - min) / span) * 100).toFixed(3)}%`;
  const width = (a: number, b: number) => `${(((b - a) / span) * 100).toFixed(3)}%`;

  return (
    <div data-testid="timeline">
      <div className="relative mb-2 h-4 text-[10px] opacity-60 md:ml-[11rem]">
        <span className="absolute left-0">{fmt(min)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(today) }}>Hôm nay {fmt(today)}</span>
        <span className="absolute right-0">{fmt(max)}</span>
      </div>
      {tasks.map((t) => {
        const start = ms(t.startDate);
        const end = Math.max(ms(t.expectedEndDate), start + DAY);
        const c = colours(t);
        const slipped = t.expectedEndDate > t.agreedDueDate;
        return (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            data-testid="timeline-row"
            className="block border-b border-dashed border-neutral-300 py-2 hover:bg-neutral-50 md:flex md:items-center dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <div className="mb-1 truncate text-sm md:mb-0 md:w-44 md:shrink-0 md:pr-2">{t.title}</div>
            <div className="relative h-[18px] w-full md:flex-1">
              <div
                className={`absolute top-0.5 h-3.5 overflow-hidden rounded-full ${c.track}`}
                style={{ left: pct(start), width: width(start, end) }}
              >
                <i className={`absolute inset-y-0 left-0 ${c.fill}`} style={{ width: `${Math.min(100, t.progress)}%` }} />
              </div>
              {slipped && (
                <div
                  data-testid="timeline-agreed"
                  title={`Hạn thống nhất ${t.agreedDueDate}`}
                  className="absolute -bottom-0.5 -top-0.5 border-l-2 border-dashed border-neutral-500"
                  style={{ left: pct(ms(t.agreedDueDate)) }}
                />
              )}
              <div
                data-testid="timeline-today"
                className="absolute -bottom-1 -top-1 w-0.5 bg-red-500"
                style={{ left: pct(today) }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
