import { getLocale, getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOdooSettingsView } from '@/server/odoo/settings';
import { countPendingCredentials, listSyncRuns } from '@/server/odoo/sync';
import type { Tone } from '@/ui/tone';
import { getAdminActor } from '../../_lib/actor';
import { AdminTabs } from '../_components/admin-tabs';
import { ConnectionCard } from './_components/connection-card';
import { MappingCard } from './_components/mapping-card';
import { ModeCard } from './_components/mode-card';
import { SyncPanel } from './_components/sync-panel';

export async function generateMetadata() {
  const t = await getTranslations('odoo');
  return { title: `${t('metaTitle')} · AgentSync` };
}
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, Tone> = { running: 'info', previewed: 'neutral', applied: 'success', failed: 'danger' };
const STATUS_KEY = { running: 'status_running', previewed: 'status_previewed', applied: 'status_applied', failed: 'status_failed' } as const;

export default async function AdminOdooPage() {
  const actor = await getAdminActor();
  const db = getDb();
  const [t, tAdmin, tErr, locale] = await Promise.all([
    getTranslations('odoo'),
    getTranslations('admin'),
    getTranslations('errors'),
    getLocale(),
  ]);
  const [settings, runs, pendingCount] = await Promise.all([
    getOdooSettingsView(db, actor),
    listSyncRuns(db, actor, 20),
    countPendingCredentials(db, actor),
  ]);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
  const modeLabel = { review: t('modeReview'), full: t('modeFull'), incremental: t('modeIncremental') } as const;
  const counts = (c: Record<string, number>) =>
    Object.entries(c)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k === 'skipped' ? t('skippedLabel') : t.has(`type_${k}`) ? t(`type_${k}`) : k}: ${n}`)
      .join(', ');

  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{tAdmin('title')}</h1>
      <AdminTabs active="odoo" />

      <ConnectionCard
        values={{
          url: settings.url ?? '',
          database: settings.database ?? '',
          login: settings.login ?? '',
          hasApiKey: settings.hasApiKey,
          encryptionReady: settings.encryptionReady,
        }}
      />
      <ModeCard mode={settings.mode} scheduleHours={settings.scheduleHours} />
      <MappingCard enabled={settings.titleMappingEnabled} mappings={settings.titleMappings} />
      <SyncPanel mode={settings.mode} locked={!settings.encryptionReady || !settings.hasApiKey} pendingCount={pendingCount} />

      <Card>
        <CardHeader>
          <CardTitle>{t('historyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>
          ) : (
            <ul className="space-y-2" data-testid="odoo-runs">
              {runs.map((r) => (
                <li key={r.id} data-testid="odoo-run" data-status={r.status} className="space-y-1 rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{fmt.format(r.startedAt)}</span>
                    <span>{modeLabel[r.mode as keyof typeof modeLabel] ?? r.mode}</span>
                    <span className="text-muted-foreground">{t(r.trigger === 'schedule' ? 'trigger_schedule' : 'trigger_manual')}</span>
                    <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(STATUS_KEY[r.status as keyof typeof STATUS_KEY] ?? 'status_failed')}</Badge>
                  </div>
                  {counts(r.counts) && <div className="break-words text-muted-foreground">{counts(r.counts)}</div>}
                  {r.status === 'failed' && r.errorKey && (
                    <div className="break-words text-danger-foreground">{tErr.has(r.errorKey) ? tErr(r.errorKey) : r.errorKey}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
