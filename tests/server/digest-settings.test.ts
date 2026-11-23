import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { slackSettings, users } from '@/db/schema';
import { getSlackSettingsView, loadSlackToken, saveSlackSettings } from '@/server/digest/settings';
import { getMyDigestPrefs, resetMyDigestPrefs, setMyDigestPrefs } from '@/server/digest/prefs';
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
