import type { PlanStep } from '@/db/schema';
import { relativeTime } from '../_lib/relative-time';

const MARK = { todo: '○', doing: '◐', done: '●' } as const;

export function PlanSummary({
  steps, history, now,
}: {
  steps: PlanStep[];
  history: { kind: string; reason: string | null; createdAt: Date }[];
  now: Date;
}) {
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const revisions = history.filter((h) => h.kind === 'revision');
  const latest = revisions[revisions.length - 1];
  return (
    <section data-testid="plan-summary">
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Plan: {doneCount}/{steps.length} bước
        </summary>
        <ol className="mt-2 space-y-1 text-sm">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>{MARK[s.status]}</span>
              <span className={`break-words ${s.status === 'done' ? 'opacity-60' : ''}`}>{s.title}</span>
            </li>
          ))}
        </ol>
      </details>
      {revisions.length > 0 && (
        <p className="mt-2 text-xs opacity-70">
          Plan đã đổi {revisions.length} lần
          {latest?.reason && <> · Lý do gần nhất: {latest.reason}</>}
          {latest && <> ({relativeTime(latest.createdAt, now)})</>}
        </p>
      )}
    </section>
  );
}
