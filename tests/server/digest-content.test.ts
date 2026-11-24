import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { slackSettings, managerFeedback, planVersions, questions, users } from '@/db/schema';
import { collectDigestData, isDigestEmpty, type DigestData } from '@/server/digest/collect';
import { buildDigest } from '@/server/digest/build';
import { serverTranslator } from '@/i18n/translator';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

const NOW = new Date('2026-11-25T03:00:00Z'); // Wed 10:00 VN
const SINCE = new Date('2026-11-24T03:00:00Z');
const TZ = 'Asia/Ho_Chi_Minh';
const APP = 'https://app.example.com';

const emptyMine = (): DigestData['mine'] => ({
  rejected: [], changesRequested: [], questionsForMe: [], answers: [], dueSoon: [], pendingApprovalSteps: 0,
});
const emptyData = (): DigestData => ({
  manager: { awaiting: [], problems: [], team: null }, mine: emptyMine(),
});
const item = (i: number, title = `Task ${i}`) => ({
  kind: 'blocked' as const, taskId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  taskTitle: title, ownerName: 'Owner', ownerIsMe: false, detail: 'stuck', at: NOW,
});
const opts = { locale: 'en' as const, timezone: 'Asia/Ho_Chi_Minh', appUrl: APP, now: NOW };
const allText = (r: { blocks: unknown[] }) => JSON.stringify(r.blocks);

describe('collectDigestData', () => {
  it('manager part: awaiting/problems, private excluded, own items go to mine', async () => {
    const d = await makeUser({ level: 'director' });
    const m = await makeUser({ level: 'manager', managerId: d.id });
    const a = await makeUser({ level: 'member', managerId: m.id });
    const b = await makeUser({ level: 'member', managerId: m.id });
    const blocked = await makeTask(a.id, { status: 'in_progress', title: 'A blocked' });
    await testDb.insert(questions).values({
      taskId: blocked.id, authorId: a.id, direction: 'member_to_manager', body: 'help', isBlocker: true,
    });
    const secret = await makeTask(a.id, {
      status: 'in_progress', isPrivate: true, title: 'A secret', agreedDueDate: '2026-11-01', expectedEndDate: '2026-11-01',
    });
    await testDb.insert(questions).values({
      taskId: secret.id, authorId: a.id, direction: 'member_to_manager', body: 'secret blocker', isBlocker: true,
    });
    await testDb.update(planVersions).set({ steps: [{ title: 's', status: 'pending_approval' }] }).where(eq(planVersions.taskId, secret.id));
    const cp = await makeTask(b.id, { status: 'in_progress', title: 'B cp', steps: [] });
    await testDb.update(planVersions).set({ steps: [{ title: 's', status: 'pending_approval' }] }).where(eq(planVersions.taskId, cp.id));
    const own = await makeTask(m.id, { status: 'changes_requested', title: 'M own' });
    await testDb.insert(managerFeedback).values({ taskId: own.id, authorId: d.id, kind: 'changes_requested', note: 'redo' });

    const data = await collectDigestData(testDb, m, { since: SINCE, now: NOW, timezone: TZ });
    expect(data.manager.awaiting.map((i) => [i.kind, i.taskId])).toContainEqual(['checkpoint_pending', cp.id]);
    expect(data.manager.problems.map((i) => [i.kind, i.taskId])).toContainEqual(['blocked', blocked.id]);
    expect(JSON.stringify(data.manager)).not.toContain('A secret');
    expect(JSON.stringify(data.manager)).not.toContain('secret blocker');
    expect([...data.manager.awaiting, ...data.manager.problems].some((i) => i.ownerIsMe)).toBe(false);
    expect(data.mine.changesRequested.map((c) => c.taskId)).toEqual([own.id]);
    expect(data.manager.team).toMatchObject({ active: 2 });

    // manager's manager sees no indirect reports
    const dd = await collectDigestData(testDb, d, { since: SINCE, now: NOW, timezone: TZ });
    expect(dd.manager.team).toMatchObject({ active: 1 }); // only M's own task
    expect(JSON.stringify(dd.manager)).not.toContain('A blocked');
  });

  it('reassigned report disappears from the old manager', async () => {
    const m = await makeUser({ level: 'manager' });
    const m2 = await makeUser({ level: 'manager' });
    const a = await makeUser({ managerId: m.id });
    await makeTask(a.id, { status: 'pending_confirmation', title: 'A pending' });
    expect((await collectDigestData(testDb, m, { since: SINCE, now: NOW, timezone: TZ })).manager.awaiting).toHaveLength(1);
    await testDb.update(users).set({ managerId: m2.id }).where(eq(users.id, a.id));
    const after = await collectDigestData(testDb, m, { since: SINCE, now: NOW, timezone: TZ });
    expect(after.manager.awaiting).toHaveLength(0);
    expect(after.manager.team).toBeNull();
  });

  it('disabled direct report is excluded', async () => {
    const m = await makeUser({ level: 'manager' });
    const a = await makeUser({ managerId: m.id });
    await makeTask(a.id, { status: 'pending_confirmation', title: 'Gone' });
    await testDb.update(users).set({ disabledAt: NOW }).where(eq(users.id, a.id));
    const data = await collectDigestData(testDb, m, { since: SINCE, now: NOW, timezone: TZ });
    expect(data.manager.awaiting).toHaveLength(0);
    expect(data.manager.team).toBeNull();
  });

  it('due-soon uses the passed timezone, not the user/env one', async () => {
    await testDb.update(slackSettings).set({ defaultTimezone: 'Asia/Tokyo' });
    const u = await makeUser({ digestTimezone: null });
    await makeTask(u.id, { status: 'in_progress', title: 'Edge', agreedDueDate: '2026-11-25' });
    const now = new Date('2026-11-25T11:00:00Z'); // Nov 26 01:00 in Kiritimati, Nov 24 23:00 in GMT+12
    const east = await collectDigestData(testDb, u, { since: SINCE, now, timezone: 'Pacific/Kiritimati' });
    const west = await collectDigestData(testDb, u, { since: SINCE, now, timezone: 'Etc/GMT+12' });
    expect(east.mine.dueSoon.map((x) => x.overdue)).toEqual([true]);
    expect(west.mine.dueSoon.map((x) => x.overdue)).toEqual([false]);
  });

  it('team counts only since window', async () => {
    const m = await makeUser({ level: 'manager' });
    const a = await makeUser({ managerId: m.id });
    await makeTask(a.id, { status: 'done', completedAt: new Date('2026-11-24T10:00:00Z'), createdAt: new Date('2026-11-01T00:00:00Z') });
    await makeTask(a.id, { status: 'done', completedAt: new Date('2026-11-10T00:00:00Z'), createdAt: new Date('2026-11-01T00:00:00Z') });
    await makeTask(a.id, { status: 'in_progress', createdAt: new Date('2026-11-24T12:00:00Z') });
    await makeTask(a.id, { status: 'in_progress', isPrivate: true, createdAt: new Date('2026-11-24T12:00:00Z') });
    const t = (await collectDigestData(testDb, m, { since: SINCE, now: NOW, timezone: TZ })).manager.team;
    expect(t).toEqual({ active: 1, doneSince: 1, createdSince: 1 });
  });

  it('member: questions, answers since, due soon, pending steps', async () => {
    const m = await makeUser({ level: 'manager' });
    const u = await makeUser({ managerId: m.id });
    const t1 = await makeTask(u.id, { status: 'in_progress', title: 'Q task' });
    await testDb.insert(questions).values({ taskId: t1.id, authorId: m.id, direction: 'manager_to_member', body: 'why?' });
    await testDb.insert(questions).values({
      taskId: t1.id, authorId: u.id, direction: 'member_to_manager', body: 'old q', status: 'answered',
      answer: 'old a', answeredById: m.id, answeredAt: new Date('2026-11-20T00:00:00Z'),
    });
    await testDb.insert(questions).values({
      taskId: t1.id, authorId: u.id, direction: 'member_to_manager', body: 'new q', status: 'answered',
      answer: 'new a', answeredById: m.id, answeredAt: new Date('2026-11-25T01:00:00Z'),
    });
    await makeTask(u.id, { status: 'in_progress', title: 'Tomorrow', agreedDueDate: '2026-11-26' });
    await makeTask(u.id, { status: 'in_progress', title: 'Yesterday', agreedDueDate: '2026-11-24' });
    await makeTask(u.id, { status: 'in_progress', title: 'Far', agreedDueDate: '2026-12-30' });
    const data = await collectDigestData(testDb, u, { since: SINCE, now: NOW, timezone: TZ });
    expect(data.manager.team).toBeNull();
    expect(data.mine.questionsForMe.map((q) => q.body)).toEqual(['why?']);
    expect(data.mine.answers.map((a) => a.answer)).toEqual(['new a']);
    const due = Object.fromEntries(data.mine.dueSoon.map((x) => [x.title, x.overdue]));
    expect(due).toEqual({ Tomorrow: false, Yesterday: true });
  });
});

describe('isDigestEmpty', () => {
  it('team line / pending steps do not count', () => {
    const d = emptyData();
    d.manager.team = { active: 3, doneSince: 1, createdSince: 1 };
    d.mine.pendingApprovalSteps = 2;
    expect(isDigestEmpty(d)).toBe(true);
    d.manager.problems.push(item(1));
    expect(isDigestEmpty(d)).toBe(false);
    const e = emptyData();
    e.mine.answers.push({ questionId: 'q', taskId: 't', title: 'x', body: 'b', answer: 'a', answeredAt: NOW });
    expect(isDigestEmpty(e)).toBe(false);
  });
});

describe('buildDigest', () => {
  it('localizes the header and uses the timezone date', () => {
    const d = emptyData();
    d.manager.problems.push(item(1));
    for (const locale of ['en', 'vi'] as const) {
      const r = buildDigest(d, { ...opts, locale, now: new Date('2026-11-23T20:00:00Z') });
      const t = serverTranslator(locale, 'digest');
      expect(r.text).toBeTruthy();
      expect(allText(r)).toContain(t('headerTitle'));
      expect(allText(r)).toContain('24');
      expect(allText(r)).not.toContain('23, 2026');
    }
    expect(serverTranslator('vi', 'digest')('headerTitle')).not.toBe(serverTranslator('en', 'digest')('headerTitle'));
  });

  it('caps groups at 10 with a "more" line linking home', () => {
    const d = emptyData();
    for (let i = 1; i <= 12; i++) d.manager.problems.push(item(i));
    const s = allText(buildDigest(d, opts));
    expect(s).toContain(`${APP}/tasks/${item(1).taskId}`);
    expect(s).toContain(`${APP}/tasks/${item(10).taskId}`);
    expect(s).not.toContain(item(11).taskId);
    expect(s).toContain(serverTranslator('en', 'digest')('more', { count: 2 }));
    expect(s).toContain(`<${APP}/|`);
  });

  it('escapes mrkdwn control characters in user text', () => {
    const d = emptyData();
    d.manager.problems.push({ ...item(1, 'Fix <!channel> & <https://evil.com|click>'), detail: '<@U123> >quote' });
    const s = allText(buildDigest(d, opts));
    expect(s).not.toContain('<!channel>');
    expect(s).not.toContain('<https://evil.com');
    expect(s).not.toContain('<@U123>');
    expect(s).toContain('&lt;!channel&gt; &amp; &lt;https://evil.com|click&gt;');
    expect(s).toContain('&lt;@U123&gt; &gt;quote');
  });

  it('stays within Slack limits with long notes and many items', () => {
    const d = emptyData();
    const long = '<'.repeat(5000);
    for (let i = 1; i <= 30; i++) {
      d.manager.problems.push({ ...item(i, long), detail: long });
      d.manager.awaiting.push({ ...item(100 + i, long), kind: 'awaiting_review', detail: long });
      d.mine.changesRequested.push({ taskId: item(i).taskId, title: long, note: long });
      d.mine.questionsForMe.push({ questionId: 'q', taskId: item(i).taskId, title: long, body: long });
    }
    const r = buildDigest(d, opts);
    expect(r.blocks.length).toBeLessThanOrEqual(50);
    for (const b of r.blocks as { type: string; text?: { text: string } }[]) {
      if (b.type === 'section') expect(b.text!.text.length).toBeLessThanOrEqual(3000);
    }
  });

  it('test mode adds a marker and an "all clear" line when empty', () => {
    const t = serverTranslator('en', 'digest');
    const s = allText(buildDigest(emptyData(), { ...opts, test: true }));
    expect(s).toContain(t('testNotice'));
    expect(s).toContain(t('nothing'));
    const d = emptyData();
    d.manager.problems.push(item(1));
    const s2 = allText(buildDigest(d, { ...opts, test: true }));
    expect(s2).toContain(t('testNotice'));
    expect(s2).not.toContain(t('nothing'));
    expect(allText(buildDigest(d, opts))).not.toContain(t('testNotice'));
  });

  it('truncates by grapheme, not UTF-16 unit', () => {
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const d = emptyData();
    d.manager.problems.push(item(1, 'x'.repeat(148) + '\u{1F600}\u{1F600}\u{1F600}'));
    const s = allText(buildDigest(d, opts));
    expect(lone.test(JSON.parse(JSON.stringify(s)))).toBe(false);
    expect(s).toContain('\u{1F600}\u2026');
    const nfd = 'ệ'.normalize('NFD').repeat(200);
    const d2 = emptyData();
    d2.manager.problems.push(item(2, nfd));
    const s2 = allText(buildDigest(d2, opts)).normalize('NFC');
    expect(s2).toContain('|' + 'ệ'.repeat(149) + '\u2026>');
  });

  it('formats due dates by locale', () => {
    const d = emptyData();
    d.mine.dueSoon.push({ taskId: item(1).taskId, title: 'T', dueDate: '2026-11-26', overdue: false });
    const en = allText(buildDigest(d, opts));
    expect(en).toContain('Nov 26, 2026');
    expect(en).not.toContain('2026-11-26');
    expect(allText(buildDigest(d, { ...opts, locale: 'vi' }))).not.toContain('2026-11-26');
  });
});
