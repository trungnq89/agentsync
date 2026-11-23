import { attentionDetail } from '@/i18n/attention';
import type { ListedTask, AttentionItem, DigestPerson, PersonCard, taskDetail } from '@/server/tasks/queries';

/** Translator over the full catalog; keys are namespaced (`mcp.noTasks`, `status.done`). */
export type T = (key: string, values?: Record<string, string | number | Date>) => string;

const cap = (c: string) => (c === 'manager' ? 'Manager' : 'Member');

export function formatTaskList(t: T, list: ListedTask[]): string {
  if (list.length === 0) return t('mcp.noTasks');
  return [
    `## ${t('mcp.tasksHeading')}`,
    ...list.map(
      (x) =>
        t('mcp.taskLine', {
          title: x.title, id: x.id, status: t(`status.${x.status}`), progress: x.progress,
          health: t(`health.${x.health}`), expected: x.expectedEndDate, due: x.agreedDueDate,
        }) +
        ` — ${t('mcp.confirmerLabel', { who: t(`mcp.confirmer${cap(x.effectiveConfirmer)}`) })}` +
        (x.repoRef?.branch ? t('mcp.branch', { branch: x.repoRef.branch }) : '') +
        (x.cwdHint ? t('mcp.cwd', { cwd: x.cwdHint }) : ''),
    ),
  ].join('\n');
}

export function formatOverview(t: T, o: { tiers: { level: string; people: PersonCard[] }[] }): string {
  const lines = [`## ${t('mcp.overviewHeading')}`];
  for (const tier of o.tiers) {
    lines.push(`### ${t(`level.${tier.level}`)}`);
    for (const p of tier.people) {
      const flags = [
        p.hasBlocked ? t('mcp.flagBlocked') : '',
        p.hasAwaitingReview ? t('mcp.flagAwaitingReview') : '',
      ].filter(Boolean);
      lines.push(
        t('mcp.personLine', { name: p.displayName, active: p.activeCount, done: p.doneCount30d }) +
          (flags.length ? t('mcp.personFlags', { flags: flags.join(', ') }) : ''),
      );
    }
  }
  return lines.join('\n');
}

export function formatAttention(t: T, items: AttentionItem[]): string {
  if (items.length === 0) return t('mcp.attentionNone');
  return [
    `## ${t('mcp.attentionHeading')}`,
    ...items.map((i) =>
      t('mcp.attentionLine', {
        kind: t(`mcp.attentionKind.${i.kind}`), title: i.taskTitle, id: i.taskId,
        owner: i.ownerIsMe ? t('attention.you') : i.ownerName,
        detail: attentionDetail((k, v) => t(`attention.${k}`, v), i),
      }),
    ),
  ].join('\n');
}

export function formatTaskDetail(t: T, d: Awaited<ReturnType<typeof taskDetail>>): string {
  const x = d.task;
  const lines = [
    `## ${x.title}`,
    t('mcp.detailOwner', { name: d.owner.displayName }),
    t('mcp.detailStatus', { status: t(`status.${x.status}`), progress: d.progress, health: t(`health.${d.health.health}`) }),
    t('mcp.detailDates', { start: x.startDate, due: x.agreedDueDate, expected: x.expectedEndDate }),
    t('mcp.detailOutcome', { outcome: x.agreedOutcome }),
    t('mcp.detailConfirmer', { who: t(`mcp.confirmer${cap(d.effectiveConfirmer)}`) }),
    `### ${t('mcp.planHeading')}`,
    ...d.plan.steps.map((s) =>
      `- [${s.status === 'done' ? 'x' : s.status === 'pending_approval' ? '~' : ' '}] ${s.title}` +
      (s.status === 'pending_approval' ? t('mcp.stepPending') : '')),
  ];
  const open = d.questions.filter((q) => q.status === 'open');
  if (open.length) {
    lines.push(`### ${t('mcp.openQuestionsHeading')}`);
    for (const q of open) lines.push(`- (id: ${q.id}) ${q.isBlocker ? `${t('mcp.blockerTag')} ` : ''}${q.body}`);
  }
  if (d.updates.length) {
    lines.push(`### ${t('mcp.recentUpdatesHeading')}`);
    for (const u of d.updates.slice(0, 3)) lines.push(`- ${u.createdAt.toISOString().slice(0, 10)}: ${u.body}`);
  }
  return lines.join('\n');
}

export function formatDigest(t: T, d: { people: DigestPerson[] }): string {
  if (d.people.length === 0) return t('mcp.digestNone');
  const lines = [`## ${t('mcp.digestHeading')}`];
  for (const p of d.people) {
    lines.push(`### ${p.displayName}`);
    for (const x of p.completed) lines.push(`- ${t('mcp.digestDone', { title: x.title })}`);
    for (const x of p.started) lines.push(`- ${t('mcp.digestStarted', { title: x.title })}`);
    for (const x of p.blocked) lines.push(`- ${t('mcp.digestBlocked', { title: x.title, detail: x.detail })}`);
    for (const x of p.slipped) lines.push(`- ${t('mcp.digestSlipped', { title: x.title, from: x.from, to: x.to })}`);
  }
  return lines.join('\n');
}
