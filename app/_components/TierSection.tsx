import type { PersonCard as Card } from '@/server/tasks/queries';
import { useTranslations } from 'next-intl';
import { PersonCard } from './PersonCard';

export function TierSection({ level, people, now }: { level: string; people: Card[]; now?: Date }) {
  const tLevel = useTranslations('level');
  return (
    <section data-testid={`tier-${level}`} className="mb-6">
      <h2 className="mb-3 border-b border-border pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {tLevel(level)}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
        {people.map((p) => (
          <PersonCard key={p.userId} card={p} now={now} />
        ))}
      </div>
    </section>
  );
}
