import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { DomainError } from '@/server/errors';
import { taskDetail } from '@/server/tasks/queries';
import { ActivityFeed } from '../../_components/ActivityFeed';
import { PlanSummary } from '../../_components/PlanSummary';
import { QuestionBox } from '../../_components/QuestionBox';
import { SolutionCard } from '../../_components/SolutionCard';
import { TaskHeader } from '../../_components/TaskHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getActor } from '../../_lib/actor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [user, { id }] = await Promise.all([getActor(), params]);
  try {
    const { task } = await taskDetail(getDb(), user, id, new Date());
    return { title: `${task.title} · AgentSync` };
  } catch {
    return {};
  }
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getActor();
  const t = await getTranslations('task');
  const { id } = await params;
  const now = new Date();
  let d;
  try {
    d = await taskDetail(getDb(), user, id, now);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const { task, owner } = d;
  const isCurrentManager = user.id !== task.ownerId && owner.managerId === user.id;
  return (
    <main className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('back')}
      </Link>
      <TaskHeader
        task={task} ownerName={owner.displayName} progress={d.progress} health={d.health}
        lastActivityAt={d.lastActivityAt} canConfirm={d.canConfirm} now={now}
      />
      <Card>
        <CardHeader><CardTitle>{t('agreedOutcome')}</CardTitle></CardHeader>
        <CardContent><p className="break-words whitespace-pre-wrap text-sm">{task.agreedOutcome}</p></CardContent>
      </Card>
      <QuestionBox
        taskId={task.id} ownerId={task.ownerId} ownerName={owner.displayName} viewerId={user.id}
        isCurrentManager={isCurrentManager} questions={d.questions} now={now}
      />
      {task.mode === 'project' && (
        <SolutionCard taskId={task.id} solution={d.solution} canReview={d.canReview} />
      )}
      <PlanSummary
        taskId={task.id} ownerName={owner.displayName} steps={d.plan.steps} history={d.planHistory}
        canReview={d.canReviewCheckpoint} now={now}
      />
      <ActivityFeed updates={d.updates} now={now} />
    </main>
  );
}
