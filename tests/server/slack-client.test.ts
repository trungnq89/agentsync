import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { startFakeSlack } from '../helpers/fake-slack';
import { users } from '@/db/schema';
import { createSlackClient, slackTransport } from '@/server/digest/slack';
import { DomainError } from '@/server/errors';

const TOKEN = 'xoxb-super-secret-token';
let fake: Awaited<ReturnType<typeof startFakeSlack>> | undefined;
afterEach(async () => { await fake?.close(); fake = undefined; });
async function rejects(p: Promise<unknown>) {
  try { await p; } catch (e) { return e as DomainError; }
  throw new Error('expected rejection');
}
const start = async (extra: Partial<Parameters<typeof startFakeSlack>[0]> = {}) =>
  (fake = await startFakeSlack({ token: TOKEN, usersByEmail: { 'ann@x.com': 'U1' }, ...extra }));

describe('slack client', () => {
  it('authTest returns team and bot name', async () => {
    const f = await start();
    expect(await createSlackClient(TOKEN, f.url).authTest()).toEqual({ team: 'Acme Team', botName: 'agentsync-bot' });
  });

  it('wrong token -> slackAuthFailed without leaking the token', async () => {
    const f = await start();
    const bad = 'xoxb-wrong-token-value';
    const e = await rejects(createSlackClient(bad, f.url).authTest());
    expect(e.key).toBe('slackAuthFailed');
    expect(e.params?.code).toBe('invalid_auth');
    expect(JSON.stringify([e.message, e.params, e.key])).not.toContain(bad);
    expect(JSON.stringify([e.message, e.params])).not.toContain(TOKEN);
  });

  it('lookupByEmail returns id or slackUserNotFound', async () => {
    const f = await start();
    const c = createSlackClient(TOKEN, f.url);
    expect(await c.lookupByEmail('ann@x.com')).toBe('U1');
    const e = await rejects(c.lookupByEmail('nobody@x.com'));
    expect([e.key, e.params?.code]).toEqual(['slackUserNotFound', 'users_not_found']);
  });

  it('postMessage records channel and text', async () => {
    const f = await start();
    await createSlackClient(TOKEN, f.url).postMessage('U1', { text: 'hello', blocks: [{ type: 'divider' }] });
    expect(f.posts).toEqual([{ channel: 'U1', text: 'hello', blocks: [{ type: 'divider' }] }]);
  });

  it('429 -> slackRateLimited with retryAfter', async () => {
    const f = await start({ failNext: { method: 'chat.postMessage', status: 429, retryAfter: 7 } });
    const e = await rejects(createSlackClient(TOKEN, f.url).postMessage('U1', { text: 'x' }));
    expect([e.key, e.params?.retryAfter]).toEqual(['slackRateLimited', 7]);
  });

  it('maps other errors', async () => {
    const f = await start({ failNext: { method: 'chat.postMessage', error: 'channel_not_found' } });
    const c = createSlackClient(TOKEN, f.url);
    expect((await rejects(c.postMessage('U1', { text: 'x' }))).key).toBe('slackRecipientGone');
    f.failNext({ method: 'chat.postMessage', error: 'token_revoked' });
    expect((await rejects(c.postMessage('U1', { text: 'x' }))).key).toBe('slackAuthFailed');
    f.failNext({ method: 'chat.postMessage', error: 'fatal_error' });
    const e = await rejects(c.postMessage('U1', { text: 'x' }));
    expect([e.key, e.params?.code]).toEqual(['slackUnavailable', 'fatal_error']);
    f.failNext({ method: 'chat.postMessage', status: 503 });
    expect((await rejects(c.postMessage('U1', { text: 'x' }))).key).toBe('slackUnavailable');
  });

  it('timeout -> slackUnavailable', async () => {
    const f = await start({ delayMs: 300 });
    const e = await rejects(createSlackClient(TOKEN, f.url, { timeoutMs: 50 }).authTest());
    expect(e.key).toBe('slackUnavailable');
  });
});

describe('slack transport', () => {
  it('looks up once, caches slackUserId, clears it on channel_not_found', async () => {
    const f = await start();
    const t = slackTransport(createSlackClient(TOKEN, f.url));
    expect(t.channel).toBe('slack');
    const u = await makeUser({ email: ' Ann@X.com ' });
    const r1 = await t.resolveRecipient(testDb, u);
    expect(r1).toBe('U1');
    expect(f.lookups).toEqual(['ann@x.com']);
    const [row] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(row.slackUserId).toBe('U1');
    expect(await t.resolveRecipient(testDb, row)).toBe('U1');
    expect(f.lookups).toHaveLength(1);

    await t.send('U1', { text: 'hi' });
    expect(f.posts).toHaveLength(1);

    f.failNext({ method: 'chat.postMessage', error: 'channel_not_found' });
    const e = await rejects(t.send('U1', { text: 'hi' }));
    expect(e.key).toBe('slackRecipientGone');
    const [after] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(after.slackUserId).toBeNull();
  });

  it('no email -> noEmail; unknown email -> slackUserNotFound', async () => {
    const f = await start();
    const t = slackTransport(createSlackClient(TOKEN, f.url));
    const noMail = await makeUser({ email: null });
    expect((await rejects(t.resolveRecipient(testDb, noMail))).key).toBe('noEmail');
    const stranger = await makeUser({ email: 'zed@x.com' });
    expect((await rejects(t.resolveRecipient(testDb, stranger))).key).toBe('slackUserNotFound');
  });
});
