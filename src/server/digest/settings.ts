import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { slackSettings } from '@/db/schema';
import { requireAdmin, type Actor } from '../authz';
import { DomainError } from '../errors';
import { decryptSecret, encryptSecret, isEncryptionReady } from '../secret';
import { companyDefaults, readSlackSettingsRow, validateDigestPrefs, type DigestPrefs } from './prefs';

export type SlackSettingsView = {
  enabled: boolean;
  tokenSaved: boolean;
  encryptionReady: boolean;
  appUrlSet: boolean;
  defaults: DigestPrefs;
  lastError: string | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
  pausedUntil: Date | null;
};

export type SlackSettingsInput = {
  enabled?: boolean;
  botToken?: string;
  /** `timezone: null` resets to the DEFAULT_TIMEZONE env value. */
  defaults?: Partial<Omit<DigestPrefs, 'timezone'>> & { timezone?: string | null };
};

const appUrlSet = () => !!process.env.APP_URL?.trim();

export async function getSlackSettingsView(db: Db, actor: Actor): Promise<SlackSettingsView> {
  requireAdmin(actor);
  const row = await readSlackSettingsRow(db);
  return {
    enabled: row.enabled,
    tokenSaved: !!row.botTokenEnc,
    encryptionReady: isEncryptionReady(),
    appUrlSet: appUrlSet(),
    defaults: companyDefaults(row),
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    lastErrorCode: row.lastErrorCode,
    // Only a pause still in effect is reported.
    pausedUntil: row.pausedUntil && row.pausedUntil.getTime() > Date.now() ? row.pausedUntil : null,
  };
}

export async function saveSlackSettings(db: Db, actor: Actor, input: SlackSettingsInput): Promise<void> {
  requireAdmin(actor);
  const token = input.botToken?.trim();
  if (token && !isEncryptionReady()) throw new DomainError('VALIDATION', 'encryptionKeyMissing', { field: 'botToken' });
  if (token && !token.startsWith('xoxb-')) throw new DomainError('VALIDATION', 'slackTokenInvalid', { field: 'botToken' });

  await db.transaction(async (tx) => {
    const row = await readSlackSettingsRow(tx as unknown as Db);
    const set: Partial<typeof slackSettings.$inferInsert> = {};
    if (input.defaults) {
      const { timezone, ...rest } = input.defaults;
      validateDigestPrefs({ ...rest, ...(typeof timezone === 'string' || timezone === undefined ? { timezone } : {}) }, rest.enabled ?? row.defaultEnabled);
      if (timezone === null) set.defaultTimezone = null;
    }
    if (token) {
      set.botTokenEnc = encryptSecret(token);
      set.lastError = null;
      set.lastErrorAt = null;
      set.lastErrorCode = null;
      set.pausedUntil = null;
    }
    if (input.enabled !== undefined) {
      if (input.enabled) {
        if (!isEncryptionReady()) throw new DomainError('VALIDATION', 'encryptionKeyMissing');
        if (!(set.botTokenEnc ?? row.botTokenEnc)) throw new DomainError('VALIDATION', 'slackTokenRequired', { field: 'botToken' });
        if (!appUrlSet()) throw new DomainError('VALIDATION', 'slackAppUrlRequired');
      }
      set.enabled = input.enabled;
    }
    const d = input.defaults;
    if (d) {
      if (d.enabled !== undefined) set.defaultEnabled = d.enabled;
      if (d.time !== undefined) set.defaultTime = d.time;
      if (d.days !== undefined) set.defaultDays = [...new Set(d.days)].sort((a, b) => a - b);
      if (typeof d.timezone === 'string') set.defaultTimezone = d.timezone;
    }
    if (Object.keys(set).length === 0) return;
    await tx.update(slackSettings).set(set).where(eq(slackSettings.id, 1));
  });
}

/** Internal only: decrypted bot token, or null when none is saved. */
export async function loadSlackToken(db: Db): Promise<string | null> {
  const row = await readSlackSettingsRow(db);
  if (!row.botTokenEnc) return null;
  try {
    return decryptSecret(row.botTokenEnc);
  } catch (e) {
    if (e instanceof DomainError && e.key === 'odooKeyMissing') throw new DomainError('VALIDATION', 'encryptionKeyMissing');
    throw e;
  }
}
