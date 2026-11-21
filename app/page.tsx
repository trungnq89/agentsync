import { getDb } from '@/db';
import { needsAttention, teamOverview } from '@/server/tasks/queries';
import { AttentionList } from './_components/AttentionList';
import { TierSection } from './_components/TierSection';
import { getActor } from './_lib/actor';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getActor();
  const db = getDb();
  const now = new Date();
  const [{ tiers }, attention] = await Promise.all([teamOverview(db, user, now), needsAttention(db, user, now)]);
  const everyone = tiers.flatMap((t) => t.people);
  const empty = everyone.length <= 1 && everyone.every((p) => p.lastActivityAt === null);

  return (
    <main>
      <AttentionList items={attention} />
      {empty && (
        <p data-testid="empty-hint" className="rounded-lg border border-dashed border-neutral-400 p-4 text-sm">
          Chưa có việc hay người nào để hiển thị. Hãy làm theo hướng dẫn cài đặt agent (Cài đặt, tạo token, rồi cài
          skill cho Claude Code hoặc Codex) để agent bắt đầu đồng bộ công việc.
        </p>
      )}
      {tiers.map((t) => (
        <TierSection key={t.level} level={t.level} people={t.people} now={now} />
      ))}
    </main>
  );
}
