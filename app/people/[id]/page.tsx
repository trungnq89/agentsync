import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { DomainError } from '@/server/errors';
import { levelLabel } from '@/server/labels';
import { personTimeline } from '@/server/tasks/queries';
import { Avatar } from '../../_components/PersonCard';
import { Timeline } from '../../_components/Timeline';
import { getActor } from '../../_lib/actor';

export const dynamic = 'force-dynamic';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getActor();
  const { id } = await params;
  const now = new Date();
  let data;
  try {
    data = await personTimeline(getDb(), user, id, now);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  return (
    <main>
      <Link href="/" className="text-sm opacity-70 hover:underline">← Trang chủ</Link>
      <div className="my-4 flex items-center gap-3">
        <Avatar name={data.person.displayName} url={data.person.avatarUrl} size={44} />
        <div>
          <h1 className="text-xl font-semibold">{data.person.displayName}</h1>
          <div className="text-xs opacity-70">{levelLabel(data.person.level)}</div>
        </div>
      </div>
      <Timeline tasks={data.tasks} now={now} />
    </main>
  );
}
