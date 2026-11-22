'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import type { TitleMapping } from '@/db/schema';
import { users } from '@/db/schema';
import { requireAdmin } from '@/server/authz';
import { DomainError } from '@/server/errors';
import { createOdooClient } from '@/server/odoo/client';
import type { Change, ManagerRef, Skip } from '@/server/odoo/diff';
import { getOdooSettingsView, loadOdooConnection, saveOdooSettings, type OdooMode } from '@/server/odoo/settings';
import {
  applySync,
  listPendingCredentials,
  previewSync,
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

export type ChangeRow = {
  key: string;
  type: Change['type'];
  name: string;
  email?: string;
  level?: string;
  from?: string | null;
  to?: string | null;
  /** key of the `create` this row depends on (updateManager only). */
  dependsOnKey?: string;
  /** For a `create` whose manager is created in the same run: that manager's create key and name. */
  managerCreate?: { key: string; name: string };
};
export type PreviewView = {
  runId: string;
  mode: OdooMode;
  rows: ChangeRow[];
  skipped: { who: string; reason: Skip['reason'] }[];
  untouched: string[];
};
export type PreviewResult = { error?: string; preview?: PreviewView };
export type ApplyResult = { error?: string; counts?: SyncCounts; credentials?: Credential[] };
export type PendingResult = { error?: string; credentials?: Credential[] };
export type RunNowResult = { error?: string; counts?: SyncCounts };

export async function previewAction(): Promise<PreviewResult> {
  const actor = await getActor();
  try {
    const db = getDb();
    const [mode, res, all] = await Promise.all([
      getOdooSettingsView(db, actor).then((v) => v.mode),
      previewSync(db, actor),
      db.select().from(users),
    ]);
    const nameOf = new Map(all.map((u) => [u.id, u.displayName]));
    const userOfEmp = new Map(all.filter((u) => u.odooEmployeeId !== null).map((u) => [u.odooEmployeeId as number, u.displayName]));
    const createByEmp = new Map<number, Extract<Change, { type: 'create' }>>();
    for (const c of res.changes) if (c.type === 'create') createByEmp.set(c.employeeId, c);
    const user = (id: string) => nameOf.get(id) ?? id;
    const ref = (r: ManagerRef | null): string | null => {
      if (!r) return null;
      if ('userId' in r) return user(r.userId);
      return createByEmp.get(r.employeeId)?.displayName ?? userOfEmp.get(r.employeeId) ?? `#${r.employeeId}`;
    };
    const rows: ChangeRow[] = res.changes.map((c) => {
      switch (c.type) {
        case 'create': {
          const m = c.managerRef && 'employeeId' in c.managerRef ? createByEmp.get(c.managerRef.employeeId) : undefined;
          return {
            key: c.key, type: c.type, name: c.displayName, email: c.email, level: c.level, to: ref(c.managerRef),
            ...(m ? { managerCreate: { key: m.key, name: m.displayName } } : {}),
          };
        }
        case 'link':
          return { key: c.key, type: c.type, name: user(c.userId) };
        case 'updateManager':
          return {
            key: c.key, type: c.type, name: user(c.userId), from: c.from ? user(c.from) : null, to: ref(c.to),
            ...(c.to && 'employeeId' in c.to && createByEmp.has(c.to.employeeId) ? { dependsOnKey: createByEmp.get(c.to.employeeId)!.key } : {}),
          };
        case 'updateName':
          return { key: c.key, type: c.type, name: user(c.userId), from: c.from, to: c.to };
        case 'updateLevel':
          return { key: c.key, type: c.type, name: user(c.userId), from: c.from, to: c.to };
        case 'disable':
          return { key: c.key, type: c.type, name: user(c.userId) };
      }
    });
    const empLabel = (id: number) => `#${id}`;
    const skipped = res.skipped.map((s) => ({
      who: s.userId ? user(s.userId) : s.employeeId !== undefined ? empLabel(s.employeeId) : '?',
      reason: s.reason,
    }));
    const untouched = res.untouchedLocal.map((id) => all.find((u) => u.id === id)?.username ?? id);
    return { preview: { runId: res.runId, mode, rows, skipped, untouched } };
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
