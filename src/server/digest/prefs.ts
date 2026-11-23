import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { slackSettings, users, type SlackSettingsRow, type User } from '@/db/schema';
import type { Actor } from '../authz';
import { DomainError } from '../errors';

export type DigestPrefs = { enabled: boolean; time: string; days: number[]; timezone: string };
export type DigestPrefsView = DigestPrefs & {
  inherited: { enabled: boolean; time: boolean; days: boolean; timezone: boolean };
};

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

export function defaultTimezone(): string {
  return process.env.DEFAULT_TIMEZONE || 'Asia/Ho_Chi_Minh';
}

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Throws VALIDATION with `field` for any invalid provided value. `days` must be 1..7 and non-empty. */
export function validateDigestPrefs(p: Partial<DigestPrefs>): void {
  if (p.time !== undefined && !TIME_RE.test(p.time)) {
    throw new DomainError('VALIDATION', 'invalidDigestTime', { field: 'time' });
  }
  if (p.days !== undefined) {
    const ok = Array.isArray(p.days) && p.days.length > 0 && p.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);
    if (!ok) throw new DomainError('VALIDATION', 'digestDaysRequired', { field: 'days' });
  }
  if (p.timezone !== undefined && !(typeof p.timezone === 'string' && p.timezone && validTimezone(p.timezone))) {
    throw new DomainError('VALIDATION', 'invalidTimezone', { field: 'timezone' });
  }
}

export function companyDefaults(s: SlackSettingsRow | null | undefined): DigestPrefs {
  return {
    enabled: s?.defaultEnabled ?? true,
    time: s?.defaultTime ?? '08:30',
    days: s?.defaultDays ?? [1, 2, 3, 4, 5],
    timezone: s?.defaultTimezone || defaultTimezone(),
  };
}

export function effectiveDigestPrefs(
  user: Pick<User, 'digestEnabled' | 'digestTime' | 'digestDays' | 'digestTimezone'>,
  s: SlackSettingsRow,
): DigestPrefsView {
  const d = companyDefaults(s);
  return {
    enabled: user.digestEnabled ?? d.enabled,
    time: user.digestTime ?? d.time,
    days: user.digestDays ?? d.days,
    timezone: user.digestTimezone ?? d.timezone,
    inherited: {
      enabled: user.digestEnabled === null,
      time: user.digestTime === null,
      days: user.digestDays === null,
      timezone: user.digestTimezone === null,
    },
  };
}

async function readSettings(db: Db): Promise<SlackSettingsRow> {
  const [row] = await db.select().from(slackSettings).where(eq(slackSettings.id, 1));
  if (row) return row;
  await db.insert(slackSettings).values({ id: 1 }).onConflictDoNothing();
  const [again] = await db.select().from(slackSettings).where(eq(slackSettings.id, 1));
  return again;
}

export { readSettings as readSlackSettingsRow };

export async function getMyDigestPrefs(
  db: Db,
  actor: Actor,
): Promise<DigestPrefsView & { slackEnabled: boolean; slackLinked: boolean | null }> {
  const s = await readSettings(db);
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!u) throw new DomainError('NOT_FOUND', 'notFoundUser');
  return {
    ...effectiveDigestPrefs(u, s),
    slackEnabled: s.enabled,
    // null = not matched yet (no attempt made / cache cleared), true = cached Slack id present.
    slackLinked: u.slackUserId ? true : null,
  };
}

export async function setMyDigestPrefs(db: Db, actor: Actor, input: Partial<DigestPrefs>): Promise<void> {
  validateDigestPrefs(input);
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.enabled !== undefined) set.digestEnabled = !!input.enabled;
  if (input.time !== undefined) set.digestTime = input.time;
  if (input.days !== undefined) set.digestDays = [...new Set(input.days)].sort((a, b) => a - b);
  if (input.timezone !== undefined) set.digestTimezone = input.timezone;
  if (Object.keys(set).length === 0) return;
  await db.transaction(async (tx) => {
    await tx.update(users).set(set).where(eq(users.id, actor.id));
  });
}

export async function resetMyDigestPrefs(db: Db, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ digestEnabled: null, digestTime: null, digestDays: null, digestTimezone: null })
      .where(eq(users.id, actor.id));
  });
}
