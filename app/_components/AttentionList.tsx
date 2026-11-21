import Link from 'next/link';
import type { AttentionItem } from '@/server/tasks/queries';
import { attentionKindLabel } from '@/server/labels';

export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <section data-testid="attention" className="mb-6 rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-3">
      <h2 className="mb-2 text-sm font-semibold">Cần anh chú ý ({items.length})</h2>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={`${it.taskId}-${it.kind}-${i}`}>
            <Link href={`/tasks/${it.taskId}`} className="block text-sm hover:underline">
              <span className="mr-2 rounded bg-amber-500/25 px-1.5 py-0.5 text-xs">{attentionKindLabel(it.kind)}</span>
              <b>{it.ownerName}</b> · {it.taskTitle}
              <span className="block text-xs opacity-75">{it.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
