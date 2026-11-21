import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DomainError } from '@/server/errors';
import { personTimeline } from '@/server/tasks/queries';
import { Timeline } from '../../_components/Timeline';
import { getActor } from '../../_lib/actor';

export const dynamic = 'force-dynamic';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getActor();
  const [tLevel, t] = await Promise.all([getTranslations('level'), getTranslations('person')]);
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
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('back')}
      </Link>
      <div className="my-4 flex items-center gap-3">
        <Avatar name={data.person.displayName} src={data.person.avatarUrl ?? undefined} className="h-11 w-11" />
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold tracking-tight">{data.person.displayName}</h1>
          <Badge className="mt-1">{tLevel(data.person.level)}</Badge>
        </div>
      </div>
      <Timeline tasks={data.tasks} now={now} />
    </main>
  );
}
