import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { digestDeliveries, slackSettings, users } from '@/db/schema';
import { getSlackSettingsView, loadSlackToken, saveSlackSettings } from '@/server/digest/settings';
import { defaultTimezone, getMyDigestPrefs, resetMyDigestPrefs, setMyDigestPrefs } from '@/server/digest/prefs';
import { updateUser } from '@/server/org';
import { DomainError } from '@/server/errors';

async function rejects(p: Promise<unknown>) {
  try { await p; } catch (e) { return e as DomainError; }
  throw new Error('expected rejection');
}
const origUrl = process.env.APP_URL;
afterEach(() => { if (origUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = origUrl; });

describe('digest prefs', () => {
  it('inherits company defaults and follows admin changes', async () => {
    const admin = await makeUser({ isAdmin: true });
    const u = await makeUser();
    const p = await getMyDigestPrefs(testDb, u);
    expect(p).toMatchObject({ enabled: true, time: '08:30', days: [1, 2, 3, 4, 5], timezone: 'Asia/Ho_Chi_Minh' });
    expect(p.inherited).toEqual({ enabled: true, time: true, days: true, timezone: true });
    expect(p.slackEnabled).toBe(false);
    await saveSlackSettings(testDb, admin, { defaults: { time: '09:00' } });
    expect((await getMyDigestPrefs(testDb, u)).time).toBe('09:00');
  });

  it('validates input with field', async () => {
    const u = await makeUser();
    let e = await rejects(setMyDigestPrefs(testDb, u, { time: '08:10' }));
    expect([e.code, e.key, e.params?.field]).toEqual(['VALIDATION', 'invalidDigestTime', 'time']);
    e = await rejects(setMyDigestPrefs(testDb, u, { days: [] }));
    expect([e.key, e.params?.field]).toEqual(['digestDaysRequired', 'days']);
    e = await rejects(setMyDigestPrefs(testDb, u, { timezone: 'Mars/Base' }));
    expect([e.key, e.params?.field]).toEqual(['invalidTimezone', 'timezone']);
  });

  it('saves valid values and reset returns to null', async () => {
    const u = await makeUser();
    await setMyDigestPrefs(testDb, u, { enabled: false, time: '17:45', days: [6, 1], timezone: 'America/New_York' });
    const p = await getMyDigestPrefs(testDb, u);
    expect(p).toMatchObject({ enabled: false, time: '17:45', days: [1, 6], timezone: 'America/New_York' });
    expect(p.inherited).toEqual({ enabled: false, time: false, days: false, timezone: false });
    await resetMyDigestPrefs(testDb, u);
    const [row] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect([row.digestEnabled, row.digestTime, row.digestDays, row.digestTimezone]).toEqual([null, null, null, null]);
  });
});

describe('slack settings', () => {
  it('admin only', async () => {
    const m = await makeUser();
    expect((await rejects(getSlackSettingsView(testDb, m))).code).toBe('FORBIDDEN');
    expect((await rejects(saveSlackSettings(testDb, m, { enabled: false }))).code).toBe('FORBIDDEN');
  });

  it('stores token encrypted and never exposes it', async () => {
    const a = await makeUser({ isAdmin: true });
    process.env.APP_URL = 'http://app.test';
    await saveSlackSettings(testDb, a, { botToken: 'xoxb-secret-token' });
    const [row] = await testDb.select().from(slackSettings);
    expect(row.botTokenEnc).toBeTruthy();
    expect(row.botTokenEnc).not.toContain('xoxb-secret-token');
    const view = await getSlackSettingsView(testDb, a);
    expect(view.tokenSaved).toBe(true);
    expect(JSON.stringify(view)).not.toContain('xoxb-secret-token');
    expect(await loadSlackToken(testDb)).toBe('xoxb-secret-token');
    await saveSlackSettings(testDb, a, { botToken: '', enabled: true });
    expect(await loadSlackToken(testDb)).toBe('xoxb-secret-token');
    expect((await getSlackSettingsView(testDb, a)).enabled).toBe(true);
  });

  it('refuses to enable without token or APP_URL', async () => {
    const a = await makeUser({ isAdmin: true });
    process.env.APP_URL = 'http://app.test';
    expect((await rejects(saveSlackSettings(testDb, a, { enabled: true }))).key).toBe('slackTokenRequired');
    await saveSlackSettings(testDb, a, { botToken: 'xoxb-1' });
    delete process.env.APP_URL;
    expect((await rejects(saveSlackSettings(testDb, a, { enabled: true }))).key).toBe('slackAppUrlRequired');
  });
});

describe('email change', () => {
  it('clears slackUserId only when email changes', async () => {
    const a = await makeUser({ isAdmin: true });
    const u = await makeUser({ email: 'a@x.com', slackUserId: 'U1' });
    await updateUser(testDb, a, u.id, { email: 'A@x.com' });
    expect((await testDb.select().from(users).where(eq(users.id, u.id)))[0].slackUserId).toBe('U1');
    await updateUser(testDb, a, u.id, { email: 'b@x.com' });
    expect((await testDb.select().from(users).where(eq(users.id, u.id)))[0].slackUserId).toBeNull();
  });
});

describe('review fixes', () => {
  it('loadSlackToken maps a wrong key to encryptionKeyMissing', async () => {
    const a = await makeUser({ isAdmin: true });
    await saveSlackSettings(testDb, a, { botToken: 'xoxb-1' });
    const orig = process.env.SETTINGS_ENCRYPTION_KEY;
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    try {
      expect((await rejects(loadSlackToken(testDb))).key).toBe('encryptionKeyMissing');
    } finally {
      process.env.SETTINGS_ENCRYPTION_KEY = orig;
    }
  });

  it('saving a token without a key gives encryptionKeyMissing', async () => {
    const a = await makeUser({ isAdmin: true });
    const orig = process.env.SETTINGS_ENCRYPTION_KEY;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    try {
      expect((await rejects(saveSlackSettings(testDb, a, { botToken: 'xoxb-1' }))).key).toBe('encryptionKeyMissing');
    } finally {
      process.env.SETTINGS_ENCRYPTION_KEY = orig;
    }
  });

  it('rejects tokens without xoxb- prefix', async () => {
    const a = await makeUser({ isAdmin: true });
    const e = await rejects(saveSlackSettings(testDb, a, { botToken: 'abc' }));
    expect([e.key, e.params?.field]).toEqual(['slackTokenInvalid', 'botToken']);
  });

  it('validates admin defaults and can reset default timezone', async () => {
    const a = await makeUser({ isAdmin: true });
    expect((await rejects(saveSlackSettings(testDb, a, { defaults: { time: '08:10' } }))).key).toBe('invalidDigestTime');
    expect((await rejects(saveSlackSettings(testDb, a, { defaults: { days: [] } }))).key).toBe('digestDaysRequired');
    await saveSlackSettings(testDb, a, { defaults: { timezone: 'America/New_York' } });
    expect((await getSlackSettingsView(testDb, a)).defaults.timezone).toBe('America/New_York');
    await saveSlackSettings(testDb, a, { defaults: { timezone: null } });
    expect((await getSlackSettingsView(testDb, a)).defaults.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('accepts current IANA names that Intl.supportedValuesOf does not list', async () => {
    const a = await makeUser({ isAdmin: true });
    await saveSlackSettings(testDb, a, { defaults: { timezone: 'Asia/Ho_Chi_Minh' } });
    expect((await getSlackSettingsView(testDb, a)).defaults.timezone).toBe('Asia/Ho_Chi_Minh');
    const m = await makeUser();
    await setMyDigestPrefs(testDb, m, { timezone: 'Asia/Kolkata' });
    expect((await getMyDigestPrefs(testDb, m)).timezone).toBe('Asia/Kolkata');
  });

  it('falls back to Asia/Ho_Chi_Minh (warning once) on an invalid DEFAULT_TIMEZONE', async () => {
    const prev = process.env.DEFAULT_TIMEZONE;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      process.env.DEFAULT_TIMEZONE = 'Mars/Base';
      expect(defaultTimezone()).toBe('Asia/Ho_Chi_Minh');
      expect(defaultTimezone()).toBe('Asia/Ho_Chi_Minh');
      expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
      process.env.DEFAULT_TIMEZONE = 'Europe/Kyiv';
      expect(defaultTimezone()).toBe('Europe/Kyiv');
    } finally {
      warn.mockRestore();
      if (prev === undefined) delete process.env.DEFAULT_TIMEZONE;
      else process.env.DEFAULT_TIMEZONE = prev;
    }
  });

  it('rejects non-IANA timezones', async () => {
    const u = await makeUser();
    for (const tz of ['+07:00', 'EST', 'asia/ho_chi_minh', '']) {
      expect((await rejects(setMyDigestPrefs(testDb, u, { timezone: tz }))).key).toBe('invalidTimezone');
    }
    await setMyDigestPrefs(testDb, u, { timezone: 'UTC' });
  });

  it('empty days only rejected when effectively enabled', async () => {
    const u = await makeUser();
    expect((await rejects(setMyDigestPrefs(testDb, u, { days: [] }))).key).toBe('digestDaysRequired');
    await setMyDigestPrefs(testDb, u, { enabled: false, days: [] });
    await setMyDigestPrefs(testDb, u, { days: [] });
    expect((await rejects(setMyDigestPrefs(testDb, u, { enabled: true }))).key).toBe('digestDaysRequired');
  });

  it('email set to null clears slackUserId', async () => {
    const a = await makeUser({ isAdmin: true });
    const u = await makeUser({ email: 'a@x.com', slackUserId: 'U1' });
    await updateUser(testDb, a, u.id, { email: '' });
    expect((await testDb.select().from(users).where(eq(users.id, u.id)))[0].slackUserId).toBeNull();
  });
});

describe('slack settings view', () => {
  it('exposes pausedUntil', async () => {
    const a = await makeUser({ isAdmin: true });
    expect((await getSlackSettingsView(testDb, a)).pausedUntil).toBeNull();
    const until = new Date('2030-01-01T00:00:00Z');
    await testDb.update(slackSettings).set({ pausedUntil: until }).where(eq(slackSettings.id, 1));
    expect((await getSlackSettingsView(testDb, a)).pausedUntil?.getTime()).toBe(until.getTime());
  });
});

describe('slack match issue', () => {
  it('reports noEmail, then a not-found failure, and clears once linked', async () => {
    const u = await makeUser({ email: null });
    expect((await getMyDigestPrefs(testDb, u)).slackIssue).toBe('noEmail');
    await testDb.update(users).set({ email: 'x@y.z' }).where(eq(users.id, u.id));
    expect((await getMyDigestPrefs(testDb, u)).slackIssue).toBeNull();
    await testDb.insert(digestDeliveries).values({ userId: u.id, localDate: '2030-01-01', status: 'failed', error: 'slackUserNotFound' });
    const p = await getMyDigestPrefs(testDb, u);
    expect([p.slackIssue, p.slackLinked]).toEqual(['slackUserNotFound', false]);
    await testDb.update(users).set({ slackUserId: 'U1' }).where(eq(users.id, u.id));
    expect((await getMyDigestPrefs(testDb, u)).slackIssue).toBeNull();
  });
});
