import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { DomainError } from '@/server/errors';
import { taskDetail } from '@/server/tasks/queries';
import { ActivityFeed } from '../../_components/ActivityFeed';
import { PlanSummary } from '../../_components/PlanSummary';
import { QuestionBox } from '../../_components/QuestionBox';
import { SolutionCard } from '../../_components/SolutionCard';
import { TaskHeader } from '../../_components/TaskHeader';
import { card } from '../../_components/ui';
import { getActor } from '../../_lib/actor';

export const dynamic = 'force-dynamic';

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getActor();
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
  const lastActivityAt = new Date(Math.max(
    task.createdAt.getTime(), task.statusChangedAt.getTime(), d.updates[0]?.createdAt.getTime() ?? 0,
  ));
  return (
    <main className="space-y-5">
      <Link href="/" className="text-sm opacity-70 hover:underline">← Trang chủ</Link>
      <TaskHeader
        task={task} ownerName={owner.displayName} progress={d.progress} health={d.health}
        lastActivityAt={lastActivityAt} canConfirm={d.canConfirm} now={now}
      />
      <section className={card}>
        <h2 className="text-sm font-medium">Kết quả đã thống nhất</h2>
        <p className="mt-1 text-sm break-words whitespace-pre-wrap">{task.agreedOutcome}</p>
      </section>
      <QuestionBox
        taskId={task.id} ownerId={task.ownerId} ownerName={owner.displayName} viewerId={user.id}
        isCurrentManager={isCurrentManager} questions={d.questions} now={now}
      />
      {task.mode === 'project' && (
        <SolutionCard taskId={task.id} solution={d.solution} canReview={d.canReview} />
      )}
      <PlanSummary steps={d.plan.steps} history={d.planHistory} now={now} />
      <ActivityFeed updates={d.updates} now={now} />
    </main>
  );
}
