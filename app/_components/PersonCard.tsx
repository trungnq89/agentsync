import Link from 'next/link';
import type { PersonCard as Card } from '@/server/tasks/queries';
import { useLocale } from 'next-intl';
import type { Locale } from '@/i18n/config';
import { formatRelative } from '../_lib/format';

export function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      aria-hidden
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-bold"
    >
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function PersonCard({ card, now = new Date() }: { card: Card; now?: Date }) {
  const locale = useLocale() as Locale;
  return (
    <Link
      href={`/people/${card.userId}`}
      data-testid="person-card"
      className="relative flex min-w-[10.5rem] items-center gap-3 rounded-xl border border-neutral-300 px-3 py-2 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
    >
      {card.hasBlocked && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">kẹt</span>
      )}
      {card.hasAwaitingReview && (
        <span
          className={`absolute -top-1.5 rounded-full bg-blue-500 px-1.5 text-[10px] text-white ${card.hasBlocked ? 'right-9' : '-right-1.5'}`}
        >
          chờ review
        </span>
      )}
      <Avatar name={card.displayName} url={card.avatarUrl} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{card.displayName}</div>
        <div className="text-xs opacity-80">
          {card.doneCount30d} việc xong · {card.activeCount} việc đang làm
        </div>
        {card.lastActivityAt && (
          <div className="text-[11px] opacity-55">cập nhật {formatRelative(card.lastActivityAt, now, locale)}</div>
        )}
      </div>
    </Link>
  );
}
