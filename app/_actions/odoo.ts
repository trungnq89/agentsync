'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import type { TitleMapping } from '@/db/schema';
import { requireAdmin } from '@/server/authz';
import { DomainError } from '@/server/errors';
import { createOdooClient } from '@/server/odoo/client';
import type { PreviewView } from '@/server/odoo/preview-view';
import { loadOdooConnection, saveOdooSettings, type OdooMode } from '@/server/odoo/settings';
import {
  applySync,
  listPendingCredentials,
  previewSyncView,
  runIncrementalSync,
  type Credential,
  type SyncCounts,
} from '@/server/odoo/sync';
import { domainMessage, run, str, type FormState } from '../_lib/action';
import { getActor } from '../_lib/actor';

const PATH = '/admin/odoo';

export async function saveConnectionAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    await saveOdooSettings(getDb(), actor, {
      url: str(form, 'url'),
      database: str(form, 'database'),
      login: str(form, 'login'),
      apiKey: String(form.get('apiKey') ?? ''),
    });
    revalidatePath(PATH);
    return { ok: (await getTranslations('odoo'))('connectionSaved') };
  });
}

export async function testConnectionAction(): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    requireAdmin(actor);
    const conn = await loadOdooConnection(getDb());
    if (!conn) throw new DomainError('VALIDATION', 'odooNotConfigured');
    const { count } = await createOdooClient(conn).testConnection();
    return { ok: (await getTranslations('odoo'))('testOk', { count }) };
  });
}

export async function saveModeAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    const schedule = form.get('scheduleHours');
    await saveOdooSettings(getDb(), actor, {
      mode: str(form, 'mode') as OdooMode,
      ...(schedule !== null ? { scheduleHours: Number(schedule) } : {}),
    });
    revalidatePath(PATH);
    return { ok: (await getTranslations('odoo'))('modeSaved') };
  });
}

export async function saveMappingAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  return run(async () => {
    let rows: TitleMapping[];
    try {
      rows = JSON.parse(String(form.get('titleMappings') ?? '[]'));
    } catch {
      throw new DomainError('VALIDATION', 'odooMappingsInvalid', { field: 'titleMappings' });
    }
    await saveOdooSettings(getDb(), actor, { titleMappingEnabled: form.get('titleMappingEnabled') === 'on', titleMappings: rows });
    revalidatePath(PATH);
    return { ok: (await getTranslations('odoo'))('mappingSaved') };
  });
}

export type { ChangeRow, PreviewView } from '@/server/odoo/preview-view';
export type PreviewResult = { error?: string; preview?: PreviewView };
export type ApplyResult = { error?: string; counts?: SyncCounts; credentials?: Credential[] };
export type PendingResult = { error?: string; credentials?: Credential[] };
export type RunNowResult = { error?: string; counts?: SyncCounts };

export async function previewAction(): Promise<PreviewResult> {
  const actor = await getActor();
  try {
    return { preview: await previewSyncView(getDb(), actor) };
  } catch (e) {
    return { error: (await domainMessage(e)).message };
  }
}

export async function applyAction(runId: string, keys: string[]): Promise<ApplyResult> {
  const actor = await getActor();
  try {
    const { credentials, ...counts } = await applySync(getDb(), actor, runId, keys);
    revalidatePath(PATH);
    return { counts, credentials };
  } catch (e) {
    return { error: (await domainMessage(e)).message };
  }
}

export async function runNowAction(): Promise<RunNowResult> {
  const actor = await getActor();
  try {
    const { created, linked, updated, disabled, skipped } = await runIncrementalSync(getDb(), 'manual', actor);
    const counts = { created, linked, updated, disabled, skipped };
    revalidatePath(PATH);
    return { counts };
  } catch (e) {
    revalidatePath(PATH);
    return { error: (await domainMessage(e)).message };
  }
}

/** Returns the pending passwords and deletes them (they are shown once). */
export async function revealPendingAction(): Promise<PendingResult> {
  const actor = await getActor();
  try {
    const rows = await listPendingCredentials(getDb(), actor);
    revalidatePath(PATH);
    return { credentials: rows.map(({ email, password }) => ({ email, password })) };
  } catch (e) {
    return { error: (await domainMessage(e)).message };
  }
}
