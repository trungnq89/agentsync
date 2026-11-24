import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { digestDeliveries, questions, slackSettings, users, type User } from '@/db/schema';
import { encryptSecret } from '@/server/secret';
import { saveSlackSettings } from '@/server/digest/settings';
import { createSlackClient, slackTransport } from '@/server/digest/slack';
import {
  isDue, listDigestDeliveries, listUnmatchedSlackUsers, localParts, rematchSlackUser,
  runDigestsIfDue, runDigestsUnlocked, sendTestDigest, testSlackConnection,
} from '@/server/digest/schedule';
import { serverTranslator } from '@/i18n/translator';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';
import { startFakeSlack } from '../helpers/fake-slack';

type DigestTransportLike = ReturnType<typeof slackTransport>;
const TOKEN = 'xoxb-test-token';
const MIN = 60_000;
const MON_0830 = new Date('2026-11-23T01:30:00Z'); // Mon 08:30 Asia/Ho_Chi_Minh
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MIN);

let fake: Awaited<ReturnType<typeof startFakeSlack>>;
let emails: Record<string, string>;
let admin: User;
const prevAppUrl = process.env.APP_URL;

beforeEach(async () => {
  process.env.APP_URL = 'https://app.example.com';
  emails = {};
  fake = await startFakeSlack({ token: TOKEN, usersByEmail: emails });
  admin = await makeUser({ isAdmin: true, email: 'admin@x.com', digestEnabled: false });
  emails['admin@x.com'] = 'UADMIN';
  await saveSlackSettings(testDb, admin, { botToken: TOKEN, enabled: true });
});
afterEach(async () => {
  await fake.close();
  if (prevAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = prevAppUrl;
});

const transport = (token: string) => slackTransport(createSlackClient(token, fake.url));
const run = (now: Date) => runDigestsIfDue(testDb, now, transport);

/** Active user with Slack mapping and one overdue task so the digest has content. */
async function member(name: string, p: Partial<typeof users.$inferInsert> = {}, content = true): Promise<User> {
  const email = `${name}@x.com`;
  emails[email] = `U${name.toUpperCase()}`;
  const u = await makeUser({ email, ...p });
  if (content) await makeTask(u.id, { status: 'in_progress', agreedDueDate: '2026-11-20', expectedEndDate: '2026-11-20' });
  return u;
}
const rows = () => testDb.select().from(digestDeliveries);
const settings = async () => (await testDb.select().from(slackSettings))[0];

describe('localParts / isDue', () => {
  const prefs = { enabled: true, time: '08:30', days: [1, 2, 3, 4, 5], timezone: 'Asia/Ho_Chi_Minh' };

  it('localParts uses the zone, h23, Monday=1', () => {
    expect(localParts(new Date('2026-11-23T17:10:00Z'), 'Asia/Ho_Chi_Minh')).toEqual({ date: '2026-11-24', weekday: 2, minutes: 10 });
    expect(localParts(new Date('2026-11-29T00:00:00Z'), 'UTC')).toEqual({ date: '2026-11-29', weekday: 7, minutes: 0 });
  });

  it('is due from the configured local time on selected days', () => {
    expect(isDue(prefs, new Date('2026-11-23T01:29:00Z')).due).toBe(false);
    expect(isDue(prefs, new Date('2026-11-23T01:30:00Z'))).toEqual({ due: true, localDate: '2026-11-23' });
    expect(isDue(prefs, new Date('2026-11-28T03:00:00Z')).due).toBe(false); // Saturday
    expect(isDue({ ...prefs, enabled: false }, MON_0830).due).toBe(false);
  });

  it('Review Focus 1: localDate follows the user zone, not UTC', () => {
    const ny = { enabled: true, time: '21:00', days: [1, 2, 3, 4, 5], timezone: 'America/New_York' };
    expect(isDue(ny, new Date('2026-11-24T03:00:00Z'))).toEqual({ due: true, localDate: '2026-11-23' });
  });
});

describe('runDigestsIfDue', () => {
  it('Review Focus 1: New York user at 03:00Z gets localDate of the 23rd, once', async () => {
    await member('ny', { digestTimezone: 'America/New_York', digestTime: '21:00' });
    const now = new Date('2026-11-24T03:00:00Z');
    expect((await run(now)).sent).toBe(1);
    expect((await run(at(now, 10))).sent).toBe(0);
    expect(fake.posts).toHaveLength(1);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].localDate).toBe('2026-11-23');
    expect(r[0].status).toBe('sent');
    expect(r[0].sentAt?.toISOString()).toBe(now.toISOString());
  });

  it('Review Focus 2: two concurrent runs send one message per user', async () => {
    await member('a');
    await member('b');
    await Promise.all([run(MON_0830), run(MON_0830)]);
    expect(fake.posts).toHaveLength(2);
    expect(fake.posts.map((p) => p.channel).sort()).toEqual(['UA', 'UB']);
  });

  it('Review Focus 2: without the advisory lock the unique claim still dedupes', async () => {
    await member('a');
    await member('b');
    await Promise.all([runDigestsUnlocked(testDb, MON_0830, transport), runDigestsUnlocked(testDb, MON_0830, transport)]);
    expect(fake.posts).toHaveLength(2);
    expect(await rows()).toHaveLength(2);
  });

  it('a held advisory lock makes the run a no-op', async () => {
    await member('a');
    const c = await testDb.$client.connect();
    try {
      const { rows: l } = await c.query('select pg_advisory_lock(hashtext($1)) as x', ['agentsync-digest']);
      expect(l).toHaveLength(1);
      expect(await run(MON_0830)).toEqual({ sent: 0, skipped: 0, failed: 0 });
      expect(fake.posts).toHaveLength(0);
      await c.query('select pg_advisory_unlock(hashtext($1))', ['agentsync-digest']);
    } finally {
      c.release();
    }
    expect((await run(MON_0830)).sent).toBe(1);
  });

  it('exits when Slack is off', async () => {
    await member('a');
    await testDb.update(slackSettings).set({ enabled: false });
    expect(await run(MON_0830)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(fake.posts).toHaveLength(0);
  });

  it('exits without APP_URL', async () => {
    await member('a');
    delete process.env.APP_URL;
    expect(await run(MON_0830)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(fake.posts).toHaveLength(0);
  });

  it('Review Focus 3: changing the time earlier after today was sent sends nothing more', async () => {
    const u = await member('a');
    expect((await run(MON_0830)).sent).toBe(1);
    await testDb.update(users).set({ digestTime: '07:00' }).where(eq(users.id, u.id));
    expect((await run(at(MON_0830, 30))).sent).toBe(0);
    expect(fake.posts).toHaveLength(1);
  });

  it('Review Focus 3: moving to a later time before sending waits for the new time', async () => {
    const u = await member('b');
    await testDb.update(users).set({ digestTime: '10:00' }).where(eq(users.id, u.id));
    expect((await run(at(MON_0830, 30))).sent).toBe(0); // 09:00 local
    expect(fake.posts).toHaveLength(0);
    expect((await run(at(MON_0830, 90))).sent).toBe(1); // 10:00 local
    expect(fake.posts).toHaveLength(1);
  });

  it('catches up the same local day but never the previous day', async () => {
    await member('a');
    expect((await run(at(MON_0830, 150))).sent).toBe(1); // 11:00 local
    await testDb.delete(digestDeliveries);
    fake.posts.length = 0;
    expect(await run(new Date('2026-11-23T17:10:00Z'))).toEqual({ sent: 0, skipped: 0, failed: 0 }); // Tue 00:10 local
    expect(await rows()).toHaveLength(0);
  });

  it('Review Focus 4: wrong token aborts, leaves no rows, records lastError once', async () => {
    for (const n of ['a', 'b', 'c']) await member(n);
    await testDb.update(slackSettings).set({ botTokenEnc: encryptSecret('xoxb-wrong') });
    const r = await run(MON_0830);
    expect(r.aborted).toBe('slackAuthFailed');
    expect(r.sent).toBe(0);
    expect(await rows()).toHaveLength(0);
    expect(fake.posts).toHaveLength(0);
    const s = await settings();
    expect(s.lastError).toBe('slackAuthFailed');
    expect(s.lastErrorAt).not.toBeNull();
  });

  it('Review Focus 4: a later successful send clears lastError', async () => {
    await member('a');
    fake.failNext({ method: 'chat.postMessage', error: 'invalid_auth' });
    expect((await run(MON_0830)).aborted).toBe('slackAuthFailed');
    expect((await settings()).lastError).toBe('slackAuthFailed');
    expect(await rows()).toHaveLength(0);
    expect((await run(at(MON_0830, 16))).sent).toBe(1); // after the 15 min back-off
    const s = await settings();
    expect(s.lastError).toBeNull();
    expect(s.lastErrorAt).toBeNull();
  });

  it('rate limit stops the run and releases the claim', async () => {
    await member('a');
    await member('b');
    fake.failNext({ method: 'chat.postMessage', status: 429, retryAfter: 30 });
    const r = await run(MON_0830);
    expect(r.aborted).toBe('slackRateLimited');
    expect(r.sent).toBe(0);
    expect(await rows()).toHaveLength(0);
    expect((await run(at(MON_0830, 1))).sent).toBe(2);
  });

  it('retries failures after 5 minutes, at most 3 times', async () => {
    await member('a');
    fake.failNext({ method: 'chat.postMessage', error: 'internal_error' });
    expect((await run(MON_0830)).failed).toBe(1);
    let [r] = await rows();
    expect([r.status, r.attempts, r.error]).toEqual(['failed', 1, 'slackUnavailable']);
    expect((await run(at(MON_0830, 2))).failed).toBe(0);
    expect(fake.posts).toHaveLength(0);
    expect((await run(at(MON_0830, 6))).sent).toBe(1);
    [r] = await rows();
    expect(r.status).toBe('sent');
    expect(fake.posts).toHaveLength(1);
  });

  it('stores Slack\'s own error code next to the key, never anything else', async () => {
    await member('a');
    fake.failNext({ method: 'chat.postMessage', error: 'cannot_dm_bot' });
    await run(MON_0830);
    const [r] = await rows();
    expect([r.error, r.errorCode]).toEqual(['slackUnavailable', 'cannot_dm_bot']);
    const [d] = await listDigestDeliveries(testDb, admin);
    expect(d.errorCode).toBe('cannot_dm_bot');
  });

  it('records the Slack code of an auth failure in lastErrorCode', async () => {
    await member('a');
    fake.failNext({ method: 'chat.postMessage', error: 'missing_scope' });
    await run(MON_0830);
    const s = await settings();
    expect([s.lastError, s.lastErrorCode]).toEqual(['slackAuthFailed', 'missing_scope']);
  });

  it('does not check out a pool client when Slack is off or has no token', async () => {
    const spy = vi.spyOn(testDb.$client, 'connect');
    try {
      await testDb.update(slackSettings).set({ enabled: false }).where(eq(slackSettings.id, 1));
      expect(await run(MON_0830)).toEqual({ sent: 0, skipped: 0, failed: 0 });
      // Pool.query connects internally with a callback; a dedicated checkout (promise form) takes no argument.
      expect(spy.mock.calls.filter((c) => (c as unknown[]).length === 0)).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('gives up after 3 failed attempts', async () => {
    await member('a');
    for (const m of [0, 6, 12]) {
      fake.failNext({ method: 'chat.postMessage', error: 'internal_error' });
      expect((await run(at(MON_0830, m))).failed).toBe(1);
    }
    expect((await rows())[0].attempts).toBe(3);
    expect(await run(at(MON_0830, 30))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(fake.posts).toHaveLength(0);
  });

  it('match failures are not retried, are listed, and rematch retries them', async () => {
    const u = await member('ghost');
    delete emails['ghost@x.com'];
    const r = await run(MON_0830);
    expect(r.failed).toBe(1);
    expect((await rows())[0]).toMatchObject({ status: 'failed', error: 'slackUserNotFound' });
    await run(at(MON_0830, 10));
    expect(fake.lookups).toHaveLength(1);
    expect((await listUnmatchedSlackUsers(testDb, admin)).map((x) => x.id)).toContain(u.id);

    emails['ghost@x.com'] = 'UGHOST';
    await rematchSlackUser(testDb, admin, u.id, at(MON_0830, 11));
    expect(await rows()).toHaveLength(0);
    expect((await run(at(MON_0830, 12))).sent).toBe(1);
    expect((await listUnmatchedSlackUsers(testDb, admin)).map((x) => x.id)).not.toContain(u.id);
  });

  it('users without email are skipped (no row per day) and listed as unmatched', async () => {
    const u = await makeUser({ email: null });
    await makeTask(u.id, { status: 'in_progress', agreedDueDate: '2026-11-20', expectedEndDate: '2026-11-20' });
    expect(await run(MON_0830)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(await rows()).toHaveLength(0);
    expect((await listUnmatchedSlackUsers(testDb, admin)).map((x) => x.id)).toContain(u.id);
  });

  it('skips with skipped_empty and sends nothing when there is no content', async () => {
    await member('a', {}, false);
    const r = await run(MON_0830);
    expect(r).toMatchObject({ sent: 0, skipped: 1 });
    expect((await rows())[0].status).toBe('skipped_empty');
    expect(fake.posts).toHaveLength(0);
  });

  it('does not send to disabled users or users who turned the digest off', async () => {
    await member('gone', { disabledAt: new Date('2026-11-01T00:00:00Z') });
    await member('off', { digestEnabled: false });
    expect(await run(MON_0830)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(fake.posts).toHaveLength(0);
  });

  it('since: an answer already in yesterday\'s message is not repeated', async () => {
    const m = await makeUser({ level: 'manager', digestEnabled: false });
    const u = await member('a', { managerId: m.id }, false);
    const t = await makeTask(u.id, { status: 'in_progress', agreedDueDate: '2026-12-30', expectedEndDate: '2026-12-30' });
    await testDb.insert(questions).values({
      taskId: t.id, authorId: u.id, direction: 'member_to_manager', body: 'q', status: 'answered',
      answer: 'the-answer', answeredById: m.id, answeredAt: new Date('2026-11-23T01:00:00Z'),
    });
    expect((await run(MON_0830)).sent).toBe(1);
    expect(JSON.stringify(fake.posts[0])).toContain('the-answer');
    const next = at(MON_0830, 24 * 60);
    expect(await run(next)).toMatchObject({ sent: 0, skipped: 1 });
    expect(fake.posts).toHaveLength(1);
  });
});

describe('review fixes', () => {
  it('M4: backs off after an auth failure and a newly saved token works on the next tick', async () => {
    await member('a');
    await testDb.update(slackSettings).set({ botTokenEnc: encryptSecret('xoxb-wrong') });
    expect((await run(MON_0830)).aborted).toBe('slackAuthFailed');
    const first = (await settings()).lastErrorAt;
    expect(await run(at(MON_0830, 1))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect((await settings()).lastErrorAt).toEqual(first);
    await saveSlackSettings(testDb, admin, { botToken: TOKEN });
    expect((await settings()).pausedUntil).toBeNull();
    expect((await run(at(MON_0830, 2))).sent).toBe(1);
  });

  it('M2: honours Retry-After before the next run', async () => {
    await member('a');
    fake.failNext({ method: 'chat.postMessage', status: 429, retryAfter: 120 });
    expect((await run(MON_0830)).aborted).toBe('slackRateLimited');
    expect(await run(at(MON_0830, 1))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(fake.posts).toHaveLength(0);
    expect((await run(at(MON_0830, 3))).sent).toBe(1);
  });

  it('M1: the retry gap counts from the failure time, not the run start', async () => {
    await member('a');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(MON_0830);
      const slow = (): DigestTransportLike => ({
        channel: 'slack',
        resolveRecipient: async () => 'UA',
        send: async () => {
          vi.setSystemTime(at(MON_0830, 4));
          throw new (await import('@/server/errors')).DomainError('VALIDATION', 'slackUnavailable');
        },
      });
      expect((await runDigestsIfDue(testDb, MON_0830, slow)).failed).toBe(1);
      vi.useRealTimers();
      expect((await run(at(MON_0830, 6))).sent).toBe(0); // only 2 min after the failure
      expect((await run(at(MON_0830, 10))).sent).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('M3: a bad timezone or a throwing transport does not stop other users', async () => {
    const bad = await member('bad');
    await testDb.update(users).set({ digestTimezone: 'Not/AZone' }).where(eq(users.id, bad.id));
    await member('boom');
    await member('ok');
    const t = (token: string) => {
      const real = transport(token);
      return {
        ...real,
        send: async (db: never, u: { email: string | null }, m: never) => {
          if (u.email === 'boom@x.com') throw new Error('kaput');
          return real.send(db, u as never, m);
        },
      };
    };
    const r = await runDigestsIfDue(testDb, MON_0830, t as never);
    expect(r.sent).toBe(1);
    expect(r.failed).toBeGreaterThanOrEqual(2);
    expect(fake.posts.map((p) => p.channel)).toEqual(['UOK']);
    expect((await rows()).find((x) => x.error === 'unknown')).toBeTruthy();
  });

  it('M5: a stale claimed row is reclaimed and sent once', async () => {
    const u = await member('a');
    await testDb.insert(digestDeliveries).values({
      userId: u.id, localDate: '2026-11-23', status: 'failed', attempts: 0, error: 'claimed', updatedAt: at(MON_0830, -6),
    });
    expect((await run(MON_0830)).sent).toBe(1);
    expect(fake.posts).toHaveLength(1);
    expect((await rows())[0].status).toBe('sent');
  });

  it('I1: a dropped lock connection does not crash and the lock is freed', async () => {
    await member('a');
    const t = (token: string) => {
      const real = transport(token);
      return {
        ...real,
        send: async (db: never, u: never, m: never) => {
          await testDb.$client.query(
            "select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and granted and pid <> pg_backend_pid()",
          );
          await new Promise((r) => setTimeout(r, 200));
          return real.send(db, u, m);
        },
      };
    };
    const r = await runDigestsIfDue(testDb, MON_0830, t as never);
    expect(r.sent).toBe(1);
    await testDb.delete(digestDeliveries);
    expect((await run(MON_0830)).sent).toBe(1);
  });
});

describe('admin operations', () => {
  it('sendTestDigest sends one test message and writes no delivery row', async () => {
    await makeTask(admin.id, { status: 'in_progress', agreedDueDate: '2026-11-20', expectedEndDate: '2026-11-20' });
    expect(await sendTestDigest(testDb, admin, MON_0830, transport)).toEqual({ ok: true });
    expect(fake.posts).toHaveLength(1);
    expect(fake.posts[0].channel).toBe('UADMIN');
    expect(JSON.stringify(fake.posts[0])).toContain(serverTranslator('en', 'digest')('testNotice'));
    expect(await rows()).toHaveLength(0);
  });

  it('non-admins are forbidden everywhere', async () => {
    const u = await member('a');
    const f = async (p: Promise<unknown>) => { try { await p; } catch (e) { return (e as { code: string }).code; } return 'none'; };
    expect(await f(sendTestDigest(testDb, u, MON_0830, transport))).toBe('FORBIDDEN');
    expect(await f(testSlackConnection(testDb, u))).toBe('FORBIDDEN');
    expect(await f(rematchSlackUser(testDb, u, u.id))).toBe('FORBIDDEN');
    expect(await f(listDigestDeliveries(testDb, u))).toBe('FORBIDDEN');
    expect(await f(listUnmatchedSlackUsers(testDb, u))).toBe('FORBIDDEN');
  });

  it('testSlackConnection returns team and bot name', async () => {
    expect(await testSlackConnection(testDb, admin, (t) => createSlackClient(t, fake.url))).toEqual({ team: 'Acme Team', botName: 'agentsync-bot' });
  });

  it('listDigestDeliveries returns newest first with user names', async () => {
    const u = await member('a');
    await run(MON_0830);
    const list = await listDigestDeliveries(testDb, admin, 10);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ userId: u.id, status: 'sent', userName: u.displayName });
  });
});
