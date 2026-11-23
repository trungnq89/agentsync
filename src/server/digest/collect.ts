import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { tasks, type User } from '@/db/schema';
import { listDirectReports } from '@/server/org';
import { needsAttention, type AttentionItem, type AttentionKind } from '@/server/tasks/queries';
import { getPendingFeedback, type PendingFeedback } from '@/server/tasks/activity';
import { currentPlan } from '@/server/tasks/internal';
import { ACTIVE_STATUSES, DONE_STATUSES } from '@/server/tasks/lifecycle';

export type DigestData = {
  manager: {
    awaiting: AttentionItem[];
    problems: AttentionItem[];
    team: { active: number; doneSince: number; createdSince: number } | null;
  };
  mine: {
    rejected: PendingFeedback['rejectedCheckpoints'];
    changesRequested: PendingFeedback['changesRequested'];
    questionsForMe: PendingFeedback['questionsForMe'];
    answers: PendingFeedback['answersToMyQuestions'];
    dueSoon: { taskId: string; title: string; dueDate: string; overdue: boolean }[];
    pendingApprovalSteps: number;
  };
};

const AWAITING: readonly AttentionKind[] = ['pending_confirmation', 'awaiting_review', 'checkpoint_pending', 'question_for_me'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of `d` in the given IANA timezone. */
function localDate(d: Date, timezone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export async function collectDigestData(
  db: Db, user: User,
  { since, now, timezone }: { since: Date; now: Date; timezone: string },
): Promise<DigestData> {
  // needsAttention only looks at current, enabled direct reports and public tasks.
  const items = (await needsAttention(db, user, now)).filter((i) => !i.ownerIsMe);
  const awaiting = items.filter((i) => AWAITING.includes(i.kind));
  const problems = items.filter((i) => !AWAITING.includes(i.kind));

  const reports = await listDirectReports(db, user.id);
  let team: DigestData['manager']['team'] = null;
  if (reports.length > 0) {
    const rows = (await db.select().from(tasks).where(inArray(tasks.ownerId, reports.map((r) => r.id))))
      .filter((t) => !t.isPrivate);
    const sinceMs = since.getTime();
    team = {
      active: rows.filter((t) => ACTIVE_STATUSES.includes(t.status)).length,
      doneSince: rows.filter((t) => DONE_STATUSES.includes(t.status) && !!t.completedAt && t.completedAt.getTime() >= sinceMs).length,
      createdSince: rows.filter((t) => t.createdAt.getTime() >= sinceMs).length,
    };
  }

  const fb = await getPendingFeedback(db, user);
  const answers = fb.answersToMyQuestions.filter((a) => !!a.answeredAt && a.answeredAt.getTime() > since.getTime());

  const tz = timezone;
  const today = localDate(now, tz);
  const soonLimit = localDate(new Date(now.getTime() + 2 * DAY_MS), tz);
  const own = (await db.select().from(tasks).where(and(eq(tasks.ownerId, user.id), isNull(tasks.completedAt))))
    .filter((t) => ACTIVE_STATUSES.includes(t.status));
  const dueSoon = own
    .filter((t) => t.agreedDueDate <= soonLimit)
    .sort((a, b) => a.agreedDueDate.localeCompare(b.agreedDueDate))
    .map((t) => ({ taskId: t.id, title: t.title, dueDate: t.agreedDueDate, overdue: t.agreedDueDate < today }));
  let pendingApprovalSteps = 0;
  for (const t of own) {
    const plan = await currentPlan(db, t.id).catch(() => undefined);
    pendingApprovalSteps += plan ? plan.steps.filter((s) => s.status === 'pending_approval').length : 0;
  }

  return {
    manager: { awaiting, problems, team },
    mine: {
      rejected: fb.rejectedCheckpoints,
      changesRequested: fb.changesRequested,
      questionsForMe: fb.questionsForMe,
      answers,
      dueSoon,
      pendingApprovalSteps,
    },
  };
}

/** The team line and the pending-approval count alone never justify sending a digest. */
export function isDigestEmpty(d: DigestData): boolean {
  const m = d.mine;
  return (
    d.manager.awaiting.length === 0 && d.manager.problems.length === 0 &&
    m.rejected.length === 0 && m.changesRequested.length === 0 && m.questionsForMe.length === 0 &&
    m.answers.length === 0 && m.dueSoon.length === 0
  );
}
