import Link from 'next/link';
import type { PersonCard as Card } from '@/server/tasks/queries';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatRelative } from '../_lib/format';

export function PersonCard({ card, now = new Date() }: { card: Card; now?: Date }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('home');
  const tAttention = useTranslations('attention');
  return (
    <Link
      href={`/people/${card.userId}`}
      data-testid="person-card"
      className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:bg-surface-muted"
    >
      <Avatar decorative name={card.displayName} src={card.avatarUrl ?? undefined} className="h-9 w-9" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="truncate text-sm font-semibold" title={card.displayName}>
          {card.displayName}
        </div>
        {(card.hasBlocked || card.hasAwaitingReview) && (
          <div className="flex flex-wrap gap-1">
            {card.hasBlocked && <Badge tone="danger">{tAttention('blocked')}</Badge>}
            {card.hasAwaitingReview && <Badge tone="info">{tAttention('awaiting_review')}</Badge>}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {t('doneActive', { done: card.doneCount30d, active: card.activeCount })}
        </div>
        {card.lastActivityAt && (
          <div className="text-[11px] text-muted-foreground">
            {t('updated', { when: formatRelative(card.lastActivityAt, now, locale) })}
          </div>
        )}
      </div>
    </Link>
  );
}
