import type { Update } from '@/server/tasks/activity';
import { relativeTime } from '../_lib/relative-time';

const SHOWN = 3;

function Item({ u, now }: { u: Update; now: Date }) {
  return (
    <li data-testid="activity-item" className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="break-words whitespace-pre-wrap">{u.body}</div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs opacity-60">
        <span>{relativeTime(u.createdAt, now)}</span>
        <span>{u.source === 'auto' ? 'tự động' : 'đã duyệt'}</span>
        {u.editedAt && <span>đã sửa</span>}
      </div>
    </li>
  );
}

/** `updates` is newest first. */
export function ActivityFeed({ updates, now }: { updates: Update[]; now: Date }) {
  const head = updates.slice(0, SHOWN);
  const rest = updates.slice(SHOWN);
  return (
    <section data-testid="activity">
      <h2 className="mb-2 text-sm font-medium">Diễn biến</h2>
      {updates.length === 0 && <p className="text-sm opacity-60">Chưa có cập nhật.</p>}
      <ul className="space-y-2">
        {head.map((u) => <Item key={u.id} u={u} now={now} />)}
      </ul>
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm underline">Xem thêm</summary>
          <ul className="mt-2 space-y-2">
            {rest.map((u) => <Item key={u.id} u={u} now={now} />)}
          </ul>
        </details>
      )}
    </section>
  );
}
