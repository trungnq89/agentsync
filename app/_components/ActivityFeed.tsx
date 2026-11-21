import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import type { Update } from '@/server/tasks/activity';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelative } from '../_lib/format';
import { ActivityMore } from './ActivityMore';

const SHOWN = 3;

function Item({ u, now }: { u: Update; now: Date }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('task');
  return (
    <li data-testid="activity-item" className="rounded-md border border-border p-3 text-sm">
      <div className="break-words whitespace-pre-wrap">{u.body}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{formatRelative(u.createdAt, now, locale)}</span>
        <Badge>{u.source === 'auto' ? t('sourceAuto') : t('sourceReviewed')}</Badge>
        {u.editedAt && <span>{t('edited')}</span>}
      </div>
    </li>
  );
}

/** `updates` is newest first. */
export function ActivityFeed({ updates, now }: { updates: Update[]; now: Date }) {
  const t = useTranslations('task');
  const head = updates.slice(0, SHOWN);
  const rest = updates.slice(SHOWN);
  return (
    <Card data-testid="activity">
      <CardHeader><CardTitle>{t('activity')}</CardTitle></CardHeader>
      <CardContent>
        {updates.length === 0 && <p className="text-sm text-muted-foreground">{t('noActivity')}</p>}
        <ul className="space-y-2">
          {head.map((u) => <Item key={u.id} u={u} now={now} />)}
        </ul>
        {rest.length > 0 && (
          <ActivityMore showMore={t('showMore')} showLess={t('showLess')}>
            {rest.map((u) => <Item key={u.id} u={u} now={now} />)}
          </ActivityMore>
        )}
      </CardContent>
    </Card>
  );
}
