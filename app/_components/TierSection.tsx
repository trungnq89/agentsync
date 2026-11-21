import type { PersonCard as Card } from '@/server/tasks/queries';
import { levelLabel } from '@/server/labels';
import { PersonCard } from './PersonCard';

export function TierSection({ level, people, now }: { level: string; people: Card[]; now?: Date }) {
  return (
    <section data-testid={`tier-${level}`} className="mb-5">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-xs font-medium uppercase tracking-wider opacity-65 dark:border-neutral-700">
        {levelLabel(level)}
      </h2>
      <div className="flex flex-wrap gap-3">
        {people.map((p) => (
          <PersonCard key={p.userId} card={p} now={now} />
        ))}
      </div>
    </section>
  );
}
