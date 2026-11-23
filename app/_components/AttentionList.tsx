import Link from 'next/link';
import {
  Ban, Clock, Eye, FilePenLine, Hourglass, MessageCircleQuestion, PauseCircle, UserCheck, type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { attentionDetail } from '@/i18n/attention';
import type { AttentionItem, AttentionKind } from '@/server/tasks/queries';
import { toneForAttention, type Tone } from '@/ui/tone';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { Locale } from '@/i18n/config';
import { localizeAttention } from '../_lib/format';

const ICONS: Record<AttentionKind, LucideIcon> = {
  blocked: Ban,
  overdue: Clock,
  stale: Hourglass,
  changes_requested: FilePenLine,
  pending_confirmation: UserCheck,
  awaiting_review: Eye,
  checkpoint_pending: Eye,
  question_for_me: MessageCircleQuestion,
  paused_or_cancelled: PauseCircle,
};

// Solid tone colours are for icons only; badge text uses *-foreground on *-soft.
const ICON_TONE: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const t = useTranslations('attention');
  const locale = useLocale() as Locale;
  const tHome = useTranslations('home');
  if (items.length === 0) return null;
  return (
    <Card data-testid="attention" className="mb-6 border-l-4 border-l-warning p-4">
      <h2 className="mb-3 text-sm font-semibold">
        {tHome('attentionTitle')} ({items.length})
      </h2>
      <ul className="divide-y divide-border">
        {items.map((it, i) => {
          const tone = toneForAttention(it.kind);
          const Icon = ICONS[it.kind];
          return (
            <li key={`${it.taskId}-${it.kind}-${i}`}>
              <Link
                href={`/tasks/${it.taskId}`}
                className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-muted"
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_TONE[tone]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={tone}>{t(it.kind)}</Badge>
                    <b className="break-words">{it.ownerIsMe ? t('you') : it.ownerName}</b>
                    <span aria-hidden>·</span>
                    <span className="min-w-0 break-words">{it.taskTitle}</span>
                  </span>
                  <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                    {attentionDetail(t, localizeAttention(it, locale))}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
