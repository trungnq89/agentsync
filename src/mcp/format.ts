import { healthLabel, levelLabel, statusLabel } from '@/server/labels';
import type { ListedTask, AttentionItem, DigestPerson, PersonCard, TimelineTask, taskDetail } from '@/server/tasks/queries';

const KIND_LABEL: Record<AttentionItem['kind'], string> = {
  pending_confirmation: 'Chờ xác nhận',
  awaiting_review: 'Chờ review',
  blocked: 'Đang kẹt',
  overdue: 'Trễ hạn',
  stale: 'Lâu không cập nhật',
  paused_or_cancelled: 'Tạm dừng / đã hủy',
  changes_requested: 'Cần sửa plan',
  question_for_me: 'Có câu hỏi cho bạn',
};

export function formatTaskList(list: ListedTask[]): string {
  if (list.length === 0) return 'Không có việc nào.';
  return [
    '## Việc của bạn',
    ...list.map(
      (t) =>
        `- **${t.title}** (id: ${t.id}) — ${statusLabel(t.status)}, ${t.progress}%, ${healthLabel(t.health)}, dự kiến ${t.expectedEndDate} (hạn ${t.agreedDueDate})` +
        (t.repoRef?.branch ? `, branch: ${t.repoRef.branch}` : '') +
        (t.cwdHint ? `, thư mục: ${t.cwdHint}` : ''),
    ),
  ].join('\n');
}

export function formatOverview(o: { tiers: { level: string; people: PersonCard[] }[] }): string {
  const lines = ['## Tổng quan nhóm'];
  for (const tier of o.tiers) {
    lines.push(`### ${levelLabel(tier.level)}`);
    for (const p of tier.people) {
      const flags = [p.hasBlocked ? 'đang kẹt' : '', p.hasAwaitingReview ? 'chờ review' : ''].filter(Boolean);
      lines.push(
        `- **${p.displayName}** — đang làm ${p.activeCount}, xong 30 ngày ${p.doneCount30d}${flags.length ? ` (${flags.join(', ')})` : ''}`,
      );
    }
  }
  return lines.join('\n');
}

export function formatAttention(items: AttentionItem[]): string {
  if (items.length === 0) return 'Không có mục nào cần chú ý.';
  return [
    '## Cần chú ý',
    ...items.map((i) => `- [${KIND_LABEL[i.kind]}] **${i.taskTitle}** (id: ${i.taskId}) — ${i.ownerName}: ${i.detail}`),
  ].join('\n');
}

export function formatTaskDetail(d: Awaited<ReturnType<typeof taskDetail>>): string {
  const t = d.task;
  const lines = [
    `## ${t.title}`,
    `Người phụ trách: ${d.owner.displayName}`,
    `Trạng thái: ${statusLabel(t.status)} — ${d.progress}% — ${healthLabel(d.health.health)}`,
    `Bắt đầu ${t.startDate}, hạn thống nhất ${t.agreedDueDate}, dự kiến ${t.expectedEndDate}`,
    `Kết quả thống nhất: ${t.agreedOutcome}`,
    '### Plan',
    ...d.plan.steps.map((s) => `- [${s.status === 'done' ? 'x' : ' '}] ${s.title}`),
  ];
  const open = d.questions.filter((q) => q.status === 'open');
  if (open.length) {
    lines.push('### Vướng mắc / câu hỏi đang mở');
    for (const q of open) lines.push(`- (id: ${q.id}) ${q.isBlocker ? '[kẹt] ' : ''}${q.body}`);
  }
  if (d.updates.length) {
    lines.push('### Cập nhật gần đây');
    for (const u of d.updates.slice(0, 3)) lines.push(`- ${u.createdAt.toISOString().slice(0, 10)}: ${u.body}`);
  }
  return lines.join('\n');
}

export function formatDigest(d: { people: DigestPerson[] }): string {
  if (d.people.length === 0) return 'Tuần này chưa có thay đổi nào.';
  const lines = ['## Tổng kết tuần'];
  for (const p of d.people) {
    lines.push(`### ${p.displayName}`);
    for (const x of p.completed) lines.push(`- Xong: ${x.title}`);
    for (const x of p.started) lines.push(`- Bắt đầu: ${x.title}`);
    for (const x of p.blocked) lines.push(`- Đang kẹt: ${x.title} — ${x.detail}`);
    for (const x of p.slipped) lines.push(`- Trễ: ${x.title} (${x.from} → ${x.to})`);
  }
  return lines.join('\n');
}
