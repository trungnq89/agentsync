import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { digestDeliveries, slackSettings, users, type User } from '@/db/schema';
import { defaultLocale, isLocale } from '@/i18n/config';
import { requireAdmin, type Actor } from '../authz';
import { DomainError } from '../errors';
import { buildDigest } from './build';
import { collectDigestData, isDigestEmpty } from './collect';
import { effectiveDigestPrefs, readSlackSettingsRow, type DigestPrefs } from './prefs';
import { loadSlackToken } from './settings';
import { createSlackClient, slackTransport, type DigestTransport, type SlackClient } from './slack';

const CHANNEL = 'slack';
const MAX_ATTEMPTS = 3;
const RETRY_GAP_MS = 5 * 60_000;
const DAY_MS = 24 * 3_600_000;
/** Match failures: retrying within the day cannot help until an admin re-matches. */
const NO_RETRY = ['slackUserNotFound', 'noEmail'];
/** Session-level advisory lock key, distinct from anything the Odoo sync uses. */
const LOCK_NAME = 'agentsync-digest';

export type DigestAbortKey = 'slackAuthFailed' | 'slackRateLimited' | 'encryptionKeyMissing';
export type DigestRunResult = { sent: number; skipped: number; failed: number; aborted?: DigestAbortKey };
const AUTH_BACKOFF_MS = 15 * 60_000;
type MakeTransport = (token: string) => DigestTransport;
const defaultTransport: MakeTransport = (token) => slackTransport(createSlackClient(token));

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(now: Date, timezone: string): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${g('year')}-${g('month')}-${g('day')}`,
    weekday: WEEKDAYS[g('weekday')],
    minutes: Number(g('hour')) * 60 + Number(g('minute')),
  };
}

export function isDue(prefs: DigestPrefs, now: Date): { due: boolean; localDate: string } {
  const l = localParts(now, prefs.timezone);
  const [h, m] = prefs.time.split(':').map(Number);
  return { due: prefs.enabled && prefs.days.includes(l.weekday) && l.minutes >= h * 60 + m, localDate: l.date };
}

type Claim = { id: string; attempts: number; release: () => Promise<void> };

/**
 * Claims (user, localDate). Each claim is its own committed statement, so the unique
 * constraint dedupes across processes and no transaction spans a Slack call.
 */
async function claimRow(db: Db, userId: string, localDate: string, now: Date): Promise<Claim | null> {
  const [prev] = await db.select().from(digestDeliveries)
    .where(and(eq(digestDeliveries.userId, userId), eq(digestDeliveries.localDate, localDate), eq(digestDeliveries.channel, CHANNEL)));
  if (!prev) {
    const [ins] = await db.insert(digestDeliveries)
      .values({ userId, localDate, channel: CHANNEL, status: 'failed', attempts: 0, error: 'claimed', updatedAt: now })
      .onConflictDoNothing().returning();
    if (!ins) return null;
    return { id: ins.id, attempts: 0, release: async () => { await db.delete(digestDeliveries).where(eq(digestDeliveries.id, ins.id)); } };
  }
  const [upd] = await db.update(digestDeliveries)
    .set({ error: 'claimed', errorCode: null, updatedAt: now })
    .where(and(
      eq(digestDeliveries.id, prev.id),
      eq(digestDeliveries.status, 'failed'),
      sql`${digestDeliveries.attempts} < ${MAX_ATTEMPTS}`,
      lte(digestDeliveries.updatedAt, new Date(now.getTime() - RETRY_GAP_MS)),
      sql`(${digestDeliveries.error} is null or ${digestDeliveries.error} not in (${sql.join(NO_RETRY.map((k) => sql`${k}`), sql`, `)}))`,
    ))
    .returning();
  if (!upd) return null;
  return {
    id: upd.id,
    attempts: upd.attempts,
    release: async () => {
      await db.update(digestDeliveries).set({ error: prev.error, errorCode: prev.errorCode, updatedAt: prev.updatedAt }).where(eq(digestDeliveries.id, prev.id));
    },
  };
}

async function sinceFor(db: Db, userId: string, now: Date): Promise<Date> {
  const [last] = await db.select({ sentAt: digestDeliveries.sentAt }).from(digestDeliveries)
    .where(and(eq(digestDeliveries.userId, userId), eq(digestDeliveries.status, 'sent'), eq(digestDeliveries.channel, CHANNEL)))
    .orderBy(desc(digestDeliveries.sentAt)).limit(1);
  return last?.sentAt ?? new Date(now.getTime() - DAY_MS);
}

function userLocale(u: Pick<User, 'locale'>) {
  return isLocale(u.locale) ? u.locale : defaultLocale();
}

async function recordSlackError(db: Db, key: string, now: Date, code: string | null) {
  await db.update(slackSettings)
    .set({ lastError: key, lastErrorAt: now, lastErrorCode: code, pausedUntil: new Date(now.getTime() + AUTH_BACKOFF_MS) })
    .where(eq(slackSettings.id, 1));
}

/** The run without the advisory lock; per-user claims alone prevent duplicates. */
export async function runDigestsUnlocked(db: Db, now: Date, makeTransport: MakeTransport = defaultTransport): Promise<DigestRunResult> {
  const result: DigestRunResult = { sent: 0, skipped: 0, failed: 0 };
  const settings = await readSlackSettingsRow(db);
  const appUrl = process.env.APP_URL?.trim();
  if (!settings.enabled || !settings.botTokenEnc || !appUrl) return result;
  if (settings.pausedUntil && settings.pausedUntil.getTime() > now.getTime()) return result;
  const t0 = Date.now();
  /** Failure time: injected `now` advanced by real time spent in this run. */
  const stamp = () => new Date(now.getTime() + (Date.now() - t0));

  let token: string | null;
  try {
    token = await loadSlackToken(db);
  } catch {
    await recordSlackError(db, 'encryptionKeyMissing', now, null);
    return { ...result, aborted: 'encryptionKeyMissing' };
  }
  if (!token) return result;
  const transport = makeTransport(token);

  const active = await db.select().from(users).where(isNull(users.disabledAt));
  for (const u of active) {
    let claim: Claim | null = null;
    try {
      // No email and no cached Slack id: cannot be matched. They are listed under "Not matched", so no row per day.
      if (!u.slackUserId && !u.email?.trim()) continue;
      const prefs = effectiveDigestPrefs(u, settings);
      const { due, localDate } = isDue(prefs, now);
      if (!due) continue;
      claim = await claimRow(db, u.id, localDate, now);
      if (!claim) continue;
      const since = await sinceFor(db, u.id, now);
      const data = await collectDigestData(db, u, { since, now, timezone: prefs.timezone });
      if (isDigestEmpty(data)) {
        await db.update(digestDeliveries).set({ status: 'skipped_empty', error: null, errorCode: null, updatedAt: now }).where(eq(digestDeliveries.id, claim.id));
        result.skipped++;
        continue;
      }
      const msg = buildDigest(data, { locale: userLocale(u), timezone: prefs.timezone, appUrl, now });
      await transport.send(db, u, msg);
      await db.update(digestDeliveries).set({ status: 'sent', error: null, errorCode: null, sentAt: now, updatedAt: now }).where(eq(digestDeliveries.id, claim.id));
      result.sent++;
    } catch (e) {
      const key = e instanceof DomainError ? e.key : 'unknown';
      const code = e instanceof DomainError && typeof e.params?.code === 'string' ? e.params.code : null;
      if (claim && (key === 'slackAuthFailed' || key === 'slackRateLimited')) {
        await claim.release();
        if (key === 'slackRateLimited') {
          const ra = e instanceof DomainError && typeof e.params?.retryAfter === 'number' ? e.params.retryAfter : 60;
          await db.update(slackSettings).set({ pausedUntil: new Date(now.getTime() + ra * 1000) }).where(eq(slackSettings.id, 1));
        } else {
          await recordSlackError(db, key, now, code);
        }
        return { ...result, aborted: key };
      }
      result.failed++;
      if (claim) {
        try {
          await db.update(digestDeliveries)
            .set({ status: 'failed', attempts: claim.attempts + 1, error: key, errorCode: code, updatedAt: stamp() })
            .where(eq(digestDeliveries.id, claim.id));
        } catch {
          // Row stays 'claimed' and is retried after the gap.
        }
      }
    }
  }
  if (result.sent > 0) {
    await db.update(slackSettings).set({ lastError: null, lastErrorAt: null, lastErrorCode: null }).where(eq(slackSettings.id, 1));
  }
  return result;
}

/**
 * Takes a session-level advisory lock on a dedicated connection (not a transaction), so no
 * DB transaction is held open across Slack calls and per-user claims commit individually.
 */
export async function runDigestsIfDue(db: Db, now: Date, makeTransport: MakeTransport = defaultTransport): Promise<DigestRunResult> {
  // One pooled query per tick while Slack is off: no dedicated client or lock until there is work to do.
  const s = await readSlackSettingsRow(db);
  if (!s.enabled || !s.botTokenEnc || !process.env.APP_URL?.trim()) return { sent: 0, skipped: 0, failed: 0 };
  if (s.pausedUntil && s.pausedUntil.getTime() > now.getTime()) return { sent: 0, skipped: 0, failed: 0 };
  const conn = await db.$client.connect();
  // A checked-out client has no pool error listener; without one a dropped backend would crash the process.
  let connErr: Error | undefined;
  const onErr = (e: Error) => { connErr ??= e; };
  conn.on('error', onErr);
  try {
    const { rows } = await conn.query('select pg_try_advisory_lock(hashtext($1)) as ok', [LOCK_NAME]);
    if (!rows[0]?.ok) return { sent: 0, skipped: 0, failed: 0 };
    try {
      return await runDigestsUnlocked(db, now, makeTransport);
    } finally {
      try {
        await conn.query('select pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
      } catch (e) {
        connErr ??= e as Error; // destroyed below, which ends the session and frees the lock
      }
    }
  } catch (e) {
    connErr ??= e as Error;
    throw e;
  } finally {
    conn.off('error', onErr);
    conn.release(connErr);
  }
}

async function requireConfigured(db: Db): Promise<{ token: string; appUrl: string }> {
  const token = await loadSlackToken(db);
  if (!token) throw new DomainError('VALIDATION', 'slackTokenRequired', { field: 'botToken' });
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) throw new DomainError('VALIDATION', 'slackAppUrlRequired');
  return { token, appUrl };
}

/** Sends the admin their own digest, flagged as a test. Writes no delivery row. */
export async function sendTestDigest(
  db: Db, actor: Actor, now: Date = new Date(), makeTransport: MakeTransport = defaultTransport,
): Promise<{ ok: true }> {
  requireAdmin(actor);
  const { token, appUrl } = await requireConfigured(db);
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!u) throw new DomainError('NOT_FOUND', 'notFoundUser');
  const settings = await readSlackSettingsRow(db);
  const tz = effectiveDigestPrefs(u, settings).timezone;
  const data = await collectDigestData(db, u, { since: await sinceFor(db, u.id, now), now, timezone: tz });
  const msg = buildDigest(data, { locale: userLocale(u), timezone: tz, appUrl, now, test: true });
  await makeTransport(token).send(db, u, msg);
  return { ok: true };
}

export async function testSlackConnection(
  db: Db, actor: Actor, makeClient: (token: string) => SlackClient = (t) => createSlackClient(t),
): Promise<{ team: string; botName: string }> {
  requireAdmin(actor);
  const token = await loadSlackToken(db);
  if (!token) throw new DomainError('VALIDATION', 'slackTokenRequired', { field: 'botToken' });
  return makeClient(token).authTest();
}

/** Clears the cached Slack id and today's match-failure rows so the next run retries. */
export async function rematchSlackUser(db: Db, actor: Actor, userId: string, now: Date = new Date()): Promise<void> {
  requireAdmin(actor);
  const settings = await readSlackSettingsRow(db);
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) throw new DomainError('NOT_FOUND', 'notFoundUser');
    await tx.update(users).set({ slackUserId: null }).where(eq(users.id, userId));
    const today = localParts(now, effectiveDigestPrefs(u, settings).timezone).date;
    await tx.delete(digestDeliveries).where(and(
      eq(digestDeliveries.userId, userId), eq(digestDeliveries.localDate, today),
      eq(digestDeliveries.status, 'failed'), inArray(digestDeliveries.error, NO_RETRY),
    ));
  });
}

export async function listDigestDeliveries(db: Db, actor: Actor, limit = 50) {
  requireAdmin(actor);
  return db
    .select({
      id: digestDeliveries.id, userId: digestDeliveries.userId, userName: users.displayName,
      localDate: digestDeliveries.localDate, status: digestDeliveries.status, attempts: digestDeliveries.attempts,
      error: digestDeliveries.error, errorCode: digestDeliveries.errorCode, createdAt: digestDeliveries.createdAt, sentAt: digestDeliveries.sentAt,
    })
    .from(digestDeliveries)
    .innerJoin(users, eq(users.id, digestDeliveries.userId))
    .orderBy(desc(digestDeliveries.createdAt), desc(digestDeliveries.localDate))
    .limit(limit);
}

export type UnmatchedUser = { id: string; displayName: string; email: string | null; reason: 'noEmail' | 'slackUserNotFound' };

export async function listUnmatchedSlackUsers(db: Db, actor: Actor): Promise<UnmatchedUser[]> {
  requireAdmin(actor);
  const active = await db.select().from(users).where(isNull(users.disabledAt));
  const latest = await db.execute<{ user_id: string; status: string; error: string | null }>(sql`
    select distinct on (user_id) user_id, status, error from digest_deliveries
    where channel = ${CHANNEL} order by user_id, local_date desc, updated_at desc`);
  const notFound = new Set(latest.rows.filter((r) => r.status === 'failed' && r.error === 'slackUserNotFound').map((r) => r.user_id));
  const out: UnmatchedUser[] = [];
  for (const u of active) {
    if (!u.email?.trim()) out.push({ id: u.id, displayName: u.displayName, email: u.email, reason: 'noEmail' });
    else if (notFound.has(u.id)) out.push({ id: u.id, displayName: u.displayName, email: u.email, reason: 'slackUserNotFound' });
  }
  return out;
}
