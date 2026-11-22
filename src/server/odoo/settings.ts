import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { odooSettings, userLevel, type TitleMapping } from '@/db/schema';
import { requireAdmin, type Actor } from '../authz';
import { DomainError } from '../errors';
import { decryptSecret, encryptSecret, isEncryptionReady } from '../secret';

export type OdooMode = 'full' | 'incremental' | 'review';
export const SCHEDULE_HOURS = [0, 1, 6, 24] as const;
const MODES: readonly string[] = ['full', 'incremental', 'review'];
const MAX_MAPPINGS = 50;

export type OdooSettingsView = {
  url: string | null;
  database: string | null;
  login: string | null;
  hasApiKey: boolean;
  mode: OdooMode;
  scheduleHours: number;
  titleMappingEnabled: boolean;
  titleMappings: TitleMapping[];
  encryptionReady: boolean;
};

export type OdooSettingsInput = {
  url?: string;
  database?: string;
  login?: string;
  apiKey?: string;
  mode?: OdooMode;
  scheduleHours?: number;
  titleMappingEnabled?: boolean;
  titleMappings?: TitleMapping[];
};

async function readRow(db: Db) {
  const [row] = await db.select().from(odooSettings).where(eq(odooSettings.id, 1));
  return row ?? null;
}

export async function getOdooSettingsView(db: Db, actor: Actor): Promise<OdooSettingsView> {
  requireAdmin(actor);
  const row = await readRow(db);
  return {
    url: row?.url ?? null,
    database: row?.database ?? null,
    login: row?.login ?? null,
    hasApiKey: !!row?.apiKeyEnc,
    mode: (row?.mode as OdooMode) ?? 'review',
    scheduleHours: row?.scheduleHours ?? 0,
    titleMappingEnabled: row?.titleMappingEnabled ?? false,
    titleMappings: row?.titleMappings ?? [],
    encryptionReady: isEncryptionReady(),
  };
}

function validUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function saveOdooSettings(db: Db, actor: Actor, input: OdooSettingsInput): Promise<void> {
  requireAdmin(actor);
  const set: Partial<typeof odooSettings.$inferInsert> = {};

  if (input.url !== undefined) {
    const url = input.url.trim();
    if (!validUrl(url)) throw new DomainError('VALIDATION', 'odooUrlInvalid', { field: 'url' });
    set.url = url.replace(/\/+$/, '');
  }
  if (input.database !== undefined) set.database = input.database.trim() || null;
  if (input.login !== undefined) set.login = input.login.trim() || null;
  if (input.apiKey) set.apiKeyEnc = encryptSecret(input.apiKey);
  if (input.mode !== undefined) {
    if (!MODES.includes(input.mode)) throw new DomainError('VALIDATION', 'odooModeInvalid', { field: 'mode' });
    set.mode = input.mode;
  }
  if (input.scheduleHours !== undefined) {
    if (!(SCHEDULE_HOURS as readonly number[]).includes(input.scheduleHours)) {
      throw new DomainError('VALIDATION', 'odooScheduleInvalid', { field: 'scheduleHours' });
    }
    set.scheduleHours = input.scheduleHours;
  }
  if (input.titleMappingEnabled !== undefined) set.titleMappingEnabled = input.titleMappingEnabled;
  if (input.titleMappings !== undefined) {
    const rows = input.titleMappings;
    const bad = () => new DomainError('VALIDATION', 'odooMappingsInvalid', { field: 'titleMappings' });
    if (!Array.isArray(rows) || rows.length > MAX_MAPPINGS) throw bad();
    for (const r of rows) {
      if (!r || typeof r.pattern !== 'string' || !r.pattern.trim() || !userLevel.enumValues.includes(r.level)) throw bad();
    }
    set.titleMappings = rows.map((r) => ({ pattern: r.pattern.trim(), level: r.level }));
  }

  if (Object.keys(set).length === 0) return;
  await db
    .insert(odooSettings)
    .values({ id: 1, ...set })
    .onConflictDoUpdate({ target: odooSettings.id, set });
}

/** Internal only: decrypted connection details, or null when not fully configured. */
export async function loadOdooConnection(
  db: Db,
): Promise<{ url: string; database: string; login: string; apiKey: string } | null> {
  const row = await readRow(db);
  if (!row?.url || !row.database || !row.login || !row.apiKeyEnc) return null;
  return { url: row.url, database: row.database, login: row.login, apiKey: decryptSecret(row.apiKeyEnc) };
}
