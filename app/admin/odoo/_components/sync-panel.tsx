'use client';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmAction } from '@/components/ui/confirm-action';
import type { Tone } from '@/ui/tone';
import {
  applyAction,
  previewAction,
  revealPendingAction,
  runNowAction,
  type ChangeRow,
  type PreviewView,
} from '../../../_actions/odoo';
import type { FormState } from '../../../_lib/action';
import { CredentialsCard, type Cred } from './credentials-card';

type Counts = { created: number; linked: number; updated: number; disabled: number; skipped: number };

const TYPES = ['create', 'link', 'updateManager', 'updateName', 'updateLevel', 'disable'] as const;
const TONE: Record<(typeof TYPES)[number], Tone> = {
  create: 'success',
  link: 'info',
  updateManager: 'neutral',
  updateName: 'neutral',
  updateLevel: 'warning',
  disable: 'danger',
};

export function SyncPanel({ mode, locked, pendingCount }: { mode: string; locked: boolean; pendingCount: number }) {
  const t = useTranslations('odoo');
  const tLevel = useTranslations('level');
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [creds, setCreds] = useState<Cred[] | null>(null);
  const [pendingLeft, setPendingLeft] = useState(pendingCount);
  const review = preview?.mode === 'review';

  const blocked = useMemo(
    () => new Set((preview?.rows ?? []).filter((r) => r.dependsOnKey && !selected.has(r.dependsOnKey)).map((r) => r.key)),
    [preview, selected],
  );
  const chosen = (r: ChangeRow) => !review || (selected.has(r.key) && !blocked.has(r.key));
  const chosenKeys = (preview?.rows ?? []).filter(chosen).map((r) => r.key);

  const doPreview = () =>
    startTransition(async () => {
      setError(null);
      setCounts(null);
      setCreds(null);
      const res = await previewAction();
      if (res.error || !res.preview) {
        setPreview(null);
        setError(res.error ?? null);
        return;
      }
      setPreview(res.preview);
      setSelected(new Set(res.preview.rows.map((r) => r.key)));
    });

  const doApply = async (): Promise<FormState> => {
    if (!preview) return {};
    const res = await applyAction(preview.runId, chosenKeys);
    if (res.error || !res.counts) return { error: res.error };
    setCounts(res.counts);
    setCreds(res.credentials?.length ? res.credentials : null);
    setPreview(null);
    setError(null);
    return { ok: t('applyDone') };
  };

  const doRunNow = () =>
    startTransition(async () => {
      setError(null);
      setCreds(null);
      const res = await runNowAction();
      if (res.error || !res.counts) {
        setCounts(null);
        setError(res.error ?? null);
        return;
      }
      setCounts(res.counts);
      if (res.counts.created) setPendingLeft((n) => n + res.counts!.created);
    });

  const reveal = () =>
    startTransition(async () => {
      const res = await revealPendingAction();
      if (res.error) return setError(res.error);
      setCreds(res.credentials ?? []);
      setPendingLeft(0);
    });

  const rowDetail = (r: ChangeRow) => {
    switch (r.type) {
      case 'create':
        return [r.email, r.level ? t('levelLabel', { level: tLevel(r.level as 'member') }) : null].filter(Boolean).join(' · ');
      case 'updateManager':
        return `${r.from ?? t('noManager')} → ${r.to ?? t('noManager')}`;
      case 'updateName':
        return `${r.from} → ${r.to}`;
      case 'updateLevel':
        return `${tLevel(r.from as 'member')} → ${tLevel(r.to as 'member')}`;
      default:
        return null;
    }
  };

  const toggle = (key: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('syncTitle')}</CardTitle>
          <CardDescription>{t('syncDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={doPreview} disabled={locked || pending} loading={pending}>
              {t('preview')}
            </Button>
            {mode === 'incremental' && (
              <Button type="button" variant="outline" onClick={doRunNow} disabled={locked || pending}>
                {t('runNow')}
              </Button>
            )}
          </div>

          {error && (
            <p role="alert" data-testid="odoo-sync-error" className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
              {error}
            </p>
          )}

          {counts && (
            <p data-testid="odoo-result" className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
              <span className="font-medium">{t('resultTitle')}: </span>
              {t('resultCounts', counts)}
            </p>
          )}

          {preview && (
            <div className="space-y-4" data-testid="odoo-preview">
              {preview.mode === 'full' && (
                <p role="note" data-testid="full-warning" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
                  {t('applyFullWarning')}
                </p>
              )}
              {preview.rows.length === 0 && <p className="text-sm text-muted-foreground">{t('noChanges')}</p>}
              {TYPES.map((type) => {
                const rows = preview.rows.filter((r) => r.type === type);
                if (!rows.length) return null;
                return (
                  <section key={type} className="space-y-2" data-testid={`group-${type}`}>
                    <h4 className="flex items-center gap-2 text-sm font-semibold">
                      <Badge tone={TONE[type]}>{t(`type_${type}`)}</Badge>
                      <span className="text-muted-foreground">{rows.length}</span>
                    </h4>
                    <ul className="space-y-1">
                      {rows.map((r) => {
                        const isBlocked = blocked.has(r.key);
                        const missingManager = r.managerCreate && !selected.has(r.managerCreate.key);
                        return (
                          <li key={r.key} data-testid="change-row" className="flex items-start gap-3 rounded-md border border-border p-2 text-sm">
                            {review && (
                              <Checkbox
                                className="mt-0.5"
                                aria-label={`${t('selectChange')}: ${r.name}`}
                                checked={selected.has(r.key) && !isBlocked}
                                disabled={isBlocked}
                                onCheckedChange={(v) => toggle(r.key, v === true)}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="break-words font-medium">{r.name}</div>
                              {rowDetail(r) && <div className="break-words text-muted-foreground">{rowDetail(r)}</div>}
                              {isBlocked && r.dependsOnKey && (
                                <div className="text-xs text-warning-foreground">
                                  {t('dependsOnCreate', { name: preview.rows.find((x) => x.key === r.dependsOnKey)?.name ?? '' })}
                                </div>
                              )}
                              {review && missingManager && r.managerCreate && (
                                <div className="text-xs text-warning-foreground">{t('managerWillBeEmpty', { name: r.managerCreate.name })}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {preview.skipped.length > 0 && (
                <section className="space-y-1" data-testid="odoo-skipped">
                  <h4 className="text-sm font-semibold">{t('skippedTitle', { count: preview.skipped.length })}</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {preview.skipped.map((s, i) => (
                      <li key={i} className="break-words">
                        {s.who}: {t(`skip_${s.reason}`)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {preview.untouched.length > 0 && (
                <section className="space-y-1" data-testid="odoo-untouched">
                  <h4 className="text-sm font-semibold">{t('untouchedTitle', { count: preview.untouched.length })}</h4>
                  <p className="break-words text-sm text-muted-foreground">{preview.untouched.join(', ')}</p>
                </section>
              )}
              {preview.rows.length > 0 && (
                <ConfirmAction
                  title={t('applyTitle')}
                  description={
                    t('applyDesc', { count: chosenKeys.length }) + (preview.mode === 'full' ? ` ${t('applyFullWarning')}` : '')
                  }
                  confirmLabel={t('apply')}
                  tone="primary"
                  action={doApply}
                  trigger={<Button type="button" disabled={chosenKeys.length === 0}>{t('apply')}</Button>}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {creds && creds.length > 0 && <CredentialsCard credentials={creds} />}

      <Card>
        <CardHeader>
          <CardTitle>{t('pendingTitle', { count: pendingLeft })}</CardTitle>
          <CardDescription>{t('pendingDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingLeft > 0 ? (
            <Button type="button" variant="outline" onClick={reveal} disabled={pending}>
              {t('pendingReveal')}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('pendingNone')}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
