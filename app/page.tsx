import type { Metadata } from 'next';
import { Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { EmptyState } from '@/components/ui/empty-state';
import { needsAttention, teamOverview } from '@/server/tasks/queries';
import { AttentionList } from './_components/AttentionList';
import { TierSection } from './_components/TierSection';
import { getActor } from './_lib/actor';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home');
  return { title: `${t('pageTitle')} · AgentSync` };
}

export default async function Home() {
  const user = await getActor();
  const t = await getTranslations('home');
  const db = getDb();
  const now = new Date();
  const [{ tiers }, attention] = await Promise.all([teamOverview(db, user, now), needsAttention(db, user, now)]);
  const everyone = tiers.flatMap((tier) => tier.people);
  const empty = everyone.length <= 1 && everyone.every((p) => p.lastActivityAt === null);

  return (
    <main>
      <AttentionList items={attention} />
      {empty && (
        <div data-testid="empty-hint" className="mb-6">
          <EmptyState
            icon={<Inbox className="h-6 w-6" aria-hidden />}
            title={t('emptyTitle')}
            description={t('emptyHint')}
          />
        </div>
      )}
      {tiers.map((tier) => (
        <TierSection key={tier.level} level={tier.level} people={tier.people} now={now} />
      ))}
    </main>
  );
}
