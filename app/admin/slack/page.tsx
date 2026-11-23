import { getLocale, getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listDigestDeliveries, listUnmatchedSlackUsers } from '@/server/digest/schedule';
import { getSlackSettingsView } from '@/server/digest/settings';
import type { Tone } from '@/ui/tone';
import { getAdminActor } from '../../_lib/actor';
import { timezoneOptions } from '../../_lib/timezones';
import { AdminTabs } from '../_components/admin-tabs';
import { ConnectionCard } from './_components/connection-card';
import { DefaultsCard } from './_components/defaults-card';
import { RematchButton } from './_components/rematch-button';
import { StatusCard } from './_components/status-card';

export async function generateMetadata() {
  const t = await getTranslations('slack');
  return { title: `${t('metaTitle')} · AgentSync` };
}
export const dynamic = 'force-dynamic';

const REPO_DOCS = 'https://github.com/trungnq89/agentsync/blob/main/docs';
const STATUS_TONE: Record<string, Tone> = { sent: 'success', skipped_empty: 'neutral', failed: 'danger' };
const STATUS_KEY = { sent: 'status_sent', skipped_empty: 'status_skipped_empty', failed: 'status_failed' } as const;

export default async function AdminSlackPage() {
  const actor = await getAdminActor();
  const db = getDb();
  const [t, tAdmin, tErr, locale] = await Promise.all([
    getTranslations('slack'),
    getTranslations('admin'),
    getTranslations('errors'),
    getLocale(),
  ]);
  const [settings, unmatched, deliveries] = await Promise.all([
    getSlackSettingsView(db, actor),
    listUnmatchedSlackUsers(db, actor),
    listDigestDeliveries(db, actor, 50),
  ]);
  const tz = settings.defaults.timezone;
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: tz });
  const clock = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: tz });
  const err = (key: string | null) => (key ? (tErr.has(key) ? tErr(key) : key) : '');
  const paused = settings.pausedUntil;
  const ready = settings.encryptionReady && settings.appUrlSet && settings.tokenSaved;
  const docsUrl = `${REPO_DOCS}/${locale === 'vi' ? 'slack-setup.vi.md' : 'slack-setup.md'}`;

  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{tAdmin('title')}</h1>
      <AdminTabs active="slack" />

      <div role="note" data-testid="slack-privacy" className="rounded-lg border border-warning bg-warning-soft p-4 text-warning-foreground">
        <p className="font-semibold">{t('privacyTitle')}</p>
        <p className="text-sm">{t('privacyBody')}</p>
      </div>
      {!settings.appUrlSet && (
        <p role="alert" data-testid="slack-appurl-missing" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          {t('appUrlMissing')}
        </p>
      )}

      <ConnectionCard key={String(settings.tokenSaved)} values={{ tokenSaved: settings.tokenSaved, encryptionReady: settings.encryptionReady, docsUrl }} />
      <StatusCard enabled={settings.enabled} canEnable={ready} />

      {(settings.lastError || paused) && (
        <Card data-testid="slack-last-error">
          <CardHeader>
            <CardTitle>{t('lastErrorTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {settings.lastError && (
              <p className="break-words text-danger-foreground">
                {err(settings.lastError)}
                {settings.lastErrorAt && <span className="text-muted-foreground"> {t('lastErrorAt', { when: dateTime.format(settings.lastErrorAt) })}</span>}
              </p>
            )}
            {paused && <p data-testid="slack-paused">{t('pausedUntil', { time: clock.format(paused) })}</p>}
          </CardContent>
        </Card>
      )}

      <DefaultsCard
        key={JSON.stringify(settings.defaults)}
        values={settings.defaults}
        zones={timezoneOptions()}
        locked={!settings.encryptionReady}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('unmatchedTitle')}</CardTitle>
          <CardDescription>{t('unmatchedDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {unmatched.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('unmatchedEmpty')}</p>
          ) : (
            <Table data-testid="slack-unmatched">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colUser')}</TableHead>
                  <TableHead>{t('colEmail')}</TableHead>
                  <TableHead>{t('colReason')}</TableHead>
                  <TableHead>{t('colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatched.map((u) => (
                  <TableRow key={u.id} data-testid="slack-unmatched-row">
                    <TableCell className="font-medium">{u.displayName}</TableCell>
                    <TableCell className="break-all">{u.email ?? t('noEmailValue')}</TableCell>
                    <TableCell>{err(u.reason)}</TableCell>
                    <TableCell>
                      <RematchButton userId={u.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('historyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>
          ) : (
            <Table data-testid="slack-deliveries">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colRecipient')}</TableHead>
                  <TableHead>{t('colDate')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead>{t('colError')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => (
                  <TableRow key={d.id} data-testid="slack-delivery" data-status={d.status}>
                    <TableCell className="font-medium">{d.userName}</TableCell>
                    <TableCell className="whitespace-nowrap">{d.localDate}</TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>{t(STATUS_KEY[d.status as keyof typeof STATUS_KEY] ?? 'status_failed')}</Badge>
                    </TableCell>
                    <TableCell className="break-words text-muted-foreground">{err(d.error)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
