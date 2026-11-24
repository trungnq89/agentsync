import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { eq } from 'drizzle-orm';
import { planVersions, questions, users, type User } from '@/db/schema';
import { registerTools } from '@/mcp/tools';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

const EXPIRES = new Date('2027-02-01T00:00:00Z');

async function connect(
  getActor: () => User,
  locale: 'en' | 'vi' = 'vi',
  tok: { scope?: 'member' | 'manager'; legacy?: boolean } = {},
) {
  const server = new McpServer({ name: 'test', version: '0' });
  registerTools(server, {
    db: testDb, getActor, locale,
    tokenScope: tok.scope ?? 'manager',
    token: { expiresAt: EXPIRES, legacy: tok.legacy ?? false },
  });
  const client = new Client({ name: 'c', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

type Res = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) =>
  (await c.callTool({ name, arguments: args })) as Res;
const text = (r: Res) => r.content.map((x) => x.text).join('\n');

const newTask = {
  title: 'Việc mới', mode: 'executive', agreedOutcome: 'KQ', startDate: '2026-11-23',
  agreedDueDate: '2026-11-30', steps: ['A', 'B'],
};

describe('mcp tools', () => {
  it("revise_plan rejects step status 'done' (server-owned)", async () => {
    const me = await makeUser();
    const t = await makeTask(me.id, { status: 'in_progress' });
    const c = await connect(() => me);
    const r = await call(c, 'revise_plan', { taskId: t.id, steps: [{ title: 'Bước 1', status: 'done' }] });
    expect(r.isError).toBe(true);
  });

  it('create_task then list_my_tasks contains it with status "Chờ xác nhận"', async () => {
    const mgr = await makeUser({ level: 'manager' });
    const me = await makeUser({ managerId: mgr.id });
    const c = await connect(() => me);
    const created = await call(c, 'create_task', newTask);
    expect(created.isError).toBeFalsy();
    const list = await call(c, 'list_my_tasks');
    expect(text(list)).toContain('Việc mới');
    expect(text(list)).toContain('Chờ xác nhận');
    expect(JSON.parse(list.content[1].text)[0].title).toBe('Việc mới');
  });

  it("update_progress on other user's task returns isError with \"list_my_tasks\"", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const t = await makeTask(b.id, { status: 'in_progress' });
    const c = await connect(() => a);
    const r = await call(c, 'update_progress', { taskId: t.id, body: 'x', source: 'auto' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('list_my_tasks');
  });

  it('manager team_overview excludes grand-reports', async () => {
    const director = await makeUser({ level: 'director', displayName: 'Dir' });
    const manager = await makeUser({ level: 'manager', managerId: director.id, displayName: 'Mgr' });
    await makeUser({ managerId: manager.id, displayName: 'Grand' });
    const c = await connect(() => director);
    const r = await call(c, 'team_overview');
    expect(text(r)).toContain('Mgr');
    expect(text(r)).not.toContain('Grand');
  });

  it('needs_attention excludes private tasks', async () => {
    const mgr = await makeUser({ level: 'manager' });
    const m = await makeUser({ managerId: mgr.id });
    await makeTask(m.id, { title: 'Bí mật', isPrivate: true, status: 'pending_confirmation' });
    await makeTask(m.id, { title: 'Công khai', status: 'pending_confirmation' });
    const c = await connect(() => mgr);
    const r = await call(c, 'needs_attention');
    expect(text(r)).toContain('Công khai');
    expect(text(r)).not.toContain('Bí mật');
  });

  it('after manager change, old manager task_detail isError', async () => {
    const old = await makeUser({ level: 'manager' });
    const nu = await makeUser({ level: 'manager' });
    const m = await makeUser({ managerId: old.id });
    const t = await makeTask(m.id, { status: 'in_progress' });
    expect((await call(await connect(() => old), 'task_detail', { taskId: t.id })).isError).toBeFalsy();
    await testDb.update(users).set({ managerId: nu.id }).where(eq(users.id, m.id));
    expect((await call(await connect(() => old), 'task_detail', { taskId: t.id })).isError).toBe(true);
    expect((await call(await connect(() => nu), 'task_detail', { taskId: t.id })).isError).toBeFalsy();
  });

  it('task_detail never leaks user secrets or the owner-only repo fields', async () => {
    const mgr = await makeUser({ level: 'manager' });
    const m = await makeUser({ managerId: mgr.id, passwordHash: 'SECRETHASH' });
    const t = await makeTask(m.id, { status: 'in_progress', cwdHint: '/secret/dir' });
    const r = await call(await connect(() => mgr), 'task_detail', { taskId: t.id });
    const all = text(r);
    expect(all).not.toMatch(/passwordHash|password_hash|SECRETHASH|"username"|isAdmin|disabledAt|sendMode/);
    expect(all).not.toContain('/secret/dir');
  });

  it('task_detail and weekly_digest hide a private task from the manager', async () => {
    const mgr = await makeUser({ level: 'manager' });
    const m = await makeUser({ managerId: mgr.id });
    const t = await makeTask(m.id, { title: 'Bí mật', isPrivate: true, status: 'in_progress' });
    const c = await connect(() => mgr);
    expect((await call(c, 'task_detail', { taskId: t.id })).isError).toBe(true);
    expect(text(await call(c, 'weekly_digest'))).not.toContain('Bí mật');
  });

  it('NOT_FOUND errors point at list_my_tasks', async () => {
    const me = await makeUser();
    const r = await call(await connect(() => me), 'task_detail', { taskId: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('list_my_tasks');
  });

  it('answered question leaves get_pending_feedback after resolve_question', async () => {
    const mgr = await makeUser({ level: 'manager' });
    const m = await makeUser({ managerId: mgr.id });
    const t = await makeTask(m.id, { status: 'in_progress' });
    const mc = await connect(() => m);
    const q = JSON.parse((await call(mc, 'ask_manager', { taskId: t.id, body: 'Hỏi?' })).content[1].text);
    await call(await connect(() => mgr), 'answer_blocker', { questionId: q.id, answer: 'Đáp' });
    const before = JSON.parse((await call(mc, 'get_pending_feedback')).content[1].text);
    expect(before.answersToMyQuestions).toHaveLength(1);
    expect((await call(mc, 'resolve_question', { questionId: q.id })).isError).toBeFalsy();
    const after = JSON.parse((await call(mc, 'get_pending_feedback')).content[1].text);
    expect(after.answersToMyQuestions).toHaveLength(0);
  });

  it('create_task with a non-ISO startDate returns isError mentioning YYYY-MM-DD', async () => {
    const me = await makeUser();
    const r = await call(await connect(() => me), 'create_task', { ...newTask, startDate: 'next week' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('YYYY-MM-DD');
  });

  it('get_my_settings returns sendMode, displayName, level', async () => {
    const me = await makeUser({ displayName: 'Lan', sendMode: 'auto' });
    const r = await call(await connect(() => me), 'get_my_settings');
    expect(JSON.parse(r.content[1].text)).toEqual({ sendMode: 'auto', displayName: 'Lan', level: 'member', checkpointConfirmer: 'member',
      tokenScope: 'manager', tokenExpiresAt: EXPIRES.toISOString(), tokenLegacy: false });
  });

  it('non-domain errors are not leaked', async () => {
    const me = await makeUser();
    const c = await connect(() => me);
    const spy = (await import('vitest')).vi.spyOn(console, 'error').mockImplementation(() => {});
    const orig = testDb.select;
    let r: Res;
    try {
      testDb.select = (() => { throw new Error('SELECT secret FROM sql'); }) as never;
      r = await call(c, 'list_my_tasks');
    } finally {
      testDb.select = orig;
    }
    expect(r.isError).toBe(true);
    expect(text(r)).not.toContain('secret');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('review_solution changes_needed without note returns isError', async () => {
    const mgr = await makeUser({ level: 'manager' });
    const me = await makeUser({ managerId: mgr.id });
    const t = await makeTask(me.id, { status: 'awaiting_review' });
    const r = await call(await connect(() => mgr), 'review_solution', { taskId: t.id, verdict: 'changes_needed' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('ghi chú');
  });

  it('list_my_tasks shows repoRef.branch and cwdHint in markdown and data', async () => {
    const me = await makeUser();
    await makeTask(me.id, { status: 'in_progress', repoRef: { branch: 'feat/api-x' }, cwdHint: '/work/api' });
    const r = await call(await connect(() => me), 'list_my_tasks');
    expect(text(r)).toContain('feat/api-x');
    expect(text(r)).toContain('/work/api');
    expect(JSON.parse(r.content[1].text)[0]).toMatchObject({ repoRef: { branch: 'feat/api-x' }, cwdHint: '/work/api' });
  });

  it('replies in the user locale (en)', async () => {
    const mgr = await makeUser({ level: 'manager' });
    const me = await makeUser({ managerId: mgr.id });
    await makeTask(me.id, { title: 'Job', status: 'pending_confirmation' });
    const r = await call(await connect(() => me, 'en'), 'list_my_tasks');
    expect(text(r)).toContain('Pending confirmation');
    expect(text(r)).not.toContain('Chờ xác nhận');
  });

  it('null user locale falls back to DEFAULT_LOCALE (route logic)', async () => {
    const prev = process.env.DEFAULT_LOCALE;
    process.env.DEFAULT_LOCALE = 'vi';
    try {
      const { isLocale, defaultLocale } = await import('@/i18n/config');
      const mgr = await makeUser({ level: 'manager' });
      const me = await makeUser({ managerId: mgr.id });
      await makeTask(me.id, { title: 'Job', status: 'pending_confirmation' });
      const locale = isLocale(me.locale) ? me.locale : defaultLocale();
      const r = await call(await connect(() => me, locale), 'list_my_tasks');
      expect(text(r)).toContain('Chờ xác nhận');
    } finally {
      if (prev === undefined) delete process.env.DEFAULT_LOCALE;
      else process.env.DEFAULT_LOCALE = prev;
    }
  });

  describe('checkpoint confirmation', () => {
    const data = (r: Res) => JSON.parse(r.content[1].text);
    async function world(confirmer: 'member' | 'manager') {
      const mgr = await makeUser({ level: 'manager' });
      const me = await makeUser({ managerId: mgr.id, checkpointConfirmer: confirmer });
      const t = await makeTask(me.id, { status: 'in_progress', steps: ['A', 'B'] });
      return { mgr, me, t, member: await connect(() => me, 'en'), manager: await connect(() => mgr, 'en') };
    }

    it('member mode end to end: needs memberConfirmed, then done', async () => {
      const { me, t, member } = await world('member');
      expect(data(await call(member, 'get_my_settings')).checkpointConfirmer).toBe('member');
      expect(data(await call(member, 'list_my_tasks'))[0].effectiveConfirmer).toBe('member');
      const no = await call(member, 'update_progress', { taskId: t.id, body: 'x', stepsCompleted: ['A'], source: 'auto' });
      expect(no.isError).toBe(true);
      expect(text(no)).toContain('memberConfirmed');
      const ok = await call(member, 'update_progress', { taskId: t.id, body: 'x', stepsCompleted: ['A'], memberConfirmed: true, source: 'auto' });
      expect(ok.isError).toBeFalsy();
      const d = data(await call(member, 'task_detail', { taskId: t.id }));
      expect(d.plan.steps[0]).toMatchObject({ title: 'A', status: 'done', confirmedBy: 'member', confirmedById: me.id, confirmedVia: 'agent' });
      expect(d.effectiveConfirmer).toBe('member');
    });

    it('manager mode end to end: pending, needs_attention, reject with note, rework, approve', async () => {
      const { t, member, manager } = await world('manager');
      expect(data(await call(member, 'list_my_tasks'))[0].effectiveConfirmer).toBe('manager');
      await call(member, 'update_progress', { taskId: t.id, body: 'x', stepsCompleted: ['A', 'B'], source: 'auto' });
      expect(data(await call(member, 'task_detail', { taskId: t.id })).plan.steps.map((s: { status: string }) => s.status))
        .toEqual(['pending_approval', 'pending_approval']);
      const att = await call(manager, 'needs_attention');
      expect(text(att)).toContain('Checkpoints awaiting approval');
      expect(text(att)).toContain('2');

      const noNote = await call(manager, 'review_checkpoint', { taskId: t.id, stepTitle: 'A', decision: 'rejected' });
      expect(noNote.isError).toBe(true);
      const rej = await call(manager, 'review_checkpoint', { taskId: t.id, stepTitle: 'A', decision: 'rejected', note: 'Missing tests' });
      expect(rej.isError).toBeFalsy();
      const fb = await call(member, 'get_pending_feedback');
      expect(text(fb)).toContain('Missing tests');
      expect(data(fb).rejectedCheckpoints).toHaveLength(1);

      const appr = await call(manager, 'review_checkpoint', { taskId: t.id, stepTitle: 'B', decision: 'approved' });
      expect(appr.isError).toBeFalsy();
      await call(member, 'update_progress', { taskId: t.id, body: 'fixed', stepsCompleted: ['A'], source: 'auto' });
      expect(data(await call(member, 'get_pending_feedback')).rejectedCheckpoints).toHaveLength(0);
      const all = await call(manager, 'review_checkpoint', { taskId: t.id, decision: 'approved' });
      expect(all.isError).toBeFalsy();
      const steps = data(await call(manager, 'task_detail', { taskId: t.id })).plan.steps;
      expect(steps.map((s: { status: string }) => s.status)).toEqual(['done', 'done']);
      expect(steps[0].confirmedBy).toBe('manager');
      expect(steps.map((s: { confirmedVia: string }) => s.confirmedVia)).toEqual(['agent', 'agent']);
    });

    it('repeat approve-all is an informative non-error', async () => {
      const { t, member, manager } = await world('manager');
      await call(member, 'update_progress', { taskId: t.id, body: 'x', stepsCompleted: ['A'], source: 'auto' });
      expect((await call(manager, 'review_checkpoint', { taskId: t.id, decision: 'approved' })).isError).toBeFalsy();
      const again = await call(manager, 'review_checkpoint', { taskId: t.id, decision: 'approved' });
      expect(again.isError).toBeFalsy();
      expect(text(again)).toContain('No step is waiting');
    });

    it('rejecting a step that is not pending is a real error', async () => {
      const { t, member, manager } = await world('manager');
      await call(member, 'update_progress', { taskId: t.id, body: 'x', stepsCompleted: ['A'], source: 'auto' });
      await call(manager, 'review_checkpoint', { taskId: t.id, stepTitle: 'A', decision: 'approved' });
      const rej = await call(manager, 'review_checkpoint', { taskId: t.id, stepTitle: 'A', decision: 'rejected', note: 'too late' });
      expect(rej.isError).toBe(true);
    });

    it('review_checkpoint by a non-manager (owner or stranger) is an error', async () => {
      const { t, member } = await world('manager');
      await call(member, 'update_progress', { taskId: t.id, body: 'x', stepsCompleted: ['A'], source: 'auto' });
      expect((await call(member, 'review_checkpoint', { taskId: t.id, decision: 'approved' })).isError).toBe(true);
      const other = await makeUser({ level: 'manager' });
      const stranger = await connect(() => other, 'en');
      expect((await call(stranger, 'review_checkpoint', { taskId: t.id, decision: 'approved' })).isError).toBe(true);
    });

    it('set_checkpoint_confirmer: direct manager only', async () => {
      const { me, member, manager } = await world('member');
      const bad = await call(member, 'set_checkpoint_confirmer', { userId: me.id, confirmer: 'manager' });
      expect(bad.isError).toBe(true);
      const ok = await call(manager, 'set_checkpoint_confirmer', { userId: me.id, confirmer: 'manager' });
      expect(ok.isError).toBeFalsy();
      expect(data(ok).checkpointConfirmer).toBe('manager');
      expect(data(ok).passwordHash).toBeUndefined();
      expect((await call(manager, 'set_checkpoint_confirmer', { userId: me.id, confirmer: 'boss' })).isError).toBe(true);
    });

    it("revise_plan/planStep with status 'pending_approval' is rejected too", async () => {
      const { t, member } = await world('member');
      const r = await call(member, 'revise_plan', { taskId: t.id, steps: [{ title: 'A', status: 'pending_approval' }] });
      expect(r.isError).toBe(true);
    });
  });

  describe('token scope', () => {
    const MANAGER_TOOLS: [string, (taskId: string) => Record<string, unknown>][] = [
      ['team_overview', () => ({})],
      ['needs_attention', () => ({})],
      ['weekly_digest', () => ({})],
      ['confirm_task', (taskId) => ({ taskId })],
      ['request_changes', (taskId) => ({ taskId, note: 'n' })],
      ['answer_blocker', () => ({ questionId: '00000000-0000-4000-8000-000000000000', answer: 'a' })],
      ['ask_question', (taskId) => ({ taskId, body: 'q' })],
      ['review_solution', (taskId) => ({ taskId, verdict: 'approved' })],
      ['review_checkpoint', (taskId) => ({ taskId, decision: 'approved' })],
      ['set_checkpoint_confirmer', () => ({ userId: '00000000-0000-4000-8000-000000000000', confirmer: 'manager' })],
    ];

    it.each(MANAGER_TOOLS)('member token calling %s gets isError tokenScopeMember', async (name, args) => {
      const mgr = await makeUser({ level: 'manager' });
      const m = await makeUser({ managerId: mgr.id });
      const t = await makeTask(m.id);
      const c = await connect(() => mgr, 'en', { scope: 'member' });
      const r = await call(c, name, args(t.id));
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('member access');
    });

    it('message is translated per locale', async () => {
      const mgr = await makeUser({ level: 'manager' });
      const vi = await call(await connect(() => mgr, 'vi', { scope: 'member' }), 'needs_attention');
      expect(text(vi)).toContain('Token này chỉ có quyền member');
      const en = await call(await connect(() => mgr, 'en', { scope: 'member' }), 'needs_attention');
      expect(text(en)).toContain('This token only has member access');
    });

    it('member token review_checkpoint changes nothing', async () => {
      const mgr = await makeUser({ level: 'manager' });
      const m = await makeUser({ managerId: mgr.id });
      const t = await makeTask(m.id, { status: 'in_progress', steps: ['A'] });
      const plan = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
      await testDb.update(planVersions)
        .set({ steps: [{ title: 'A', status: 'pending_approval' }] as never })
        .where(eq(planVersions.id, plan[0].id));
      const r = await call(await connect(() => mgr, 'en', { scope: 'member' }), 'review_checkpoint',
        { taskId: t.id, decision: 'approved' });
      expect(r.isError).toBe(true);
      const [after] = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
      expect((after.steps as { status: string }[])[0].status).toBe('pending_approval');
    });

    it('manager token review_checkpoint succeeds', async () => {
      const mgr = await makeUser({ level: 'manager' });
      const m = await makeUser({ managerId: mgr.id });
      const t = await makeTask(m.id, { status: 'in_progress', steps: ['A'] });
      const plan = await testDb.select().from(planVersions).where(eq(planVersions.taskId, t.id));
      await testDb.update(planVersions)
        .set({ steps: [{ title: 'A', status: 'pending_approval' }] as never })
        .where(eq(planVersions.id, plan[0].id));
      const r = await call(await connect(() => mgr, 'en', { scope: 'manager' }), 'review_checkpoint',
        { taskId: t.id, decision: 'approved' });
      expect(r.isError).toBeFalsy();
    });

    it('member token task_detail: own task ok, report task NOT_FOUND', async () => {
      const mgr = await makeUser({ level: 'manager' });
      const m = await makeUser({ managerId: mgr.id });
      const mine = await makeTask(mgr.id, { title: 'Của tôi' });
      const theirs = await makeTask(m.id, { title: 'Của cấp dưới' });
      const c = await connect(() => mgr, 'en', { scope: 'member' });
      const ok = await call(c, 'task_detail', { taskId: mine.id });
      expect(ok.isError).toBeFalsy();
      const bad = await call(c, 'task_detail', { taskId: theirs.id });
      expect(bad.isError).toBe(true);
      expect(text(bad)).not.toContain('Của cấp dưới');
      const cm = await connect(() => mgr, 'en', { scope: 'manager' });
      expect((await call(cm, 'task_detail', { taskId: theirs.id })).isError).toBeFalsy();
    });

    it('get_my_settings reports scope and expiry', async () => {
      const me = await makeUser();
      const r = await call(await connect(() => me, 'en', { scope: 'member', legacy: true }), 'get_my_settings');
      const data = JSON.parse(r.content[1].text);
      expect(data.tokenScope).toBe('member');
      expect(data.tokenExpiresAt).toBe(EXPIRES.toISOString());
      expect(data.tokenLegacy).toBe(true);
    });
  });

  describe('member token cannot reach a report via shared tools', () => {
    async function setup() {
      const mgr = await makeUser({ level: 'manager' });
      const rep = await makeUser({ managerId: mgr.id });
      const t = await makeTask(rep.id, { status: 'in_progress' });
      return { mgr, rep, t };
    }
    const countQ = async () => (await testDb.select().from(questions)).length;

    it.each(['ask_manager', 'report_blocker'])('%s on a report task is NOT_FOUND for member, works for manager', async (name) => {
      const { mgr, t } = await setup();
      const bad = await call(await connect(() => mgr, 'en', { scope: 'member' }), name, { taskId: t.id, body: 'x' });
      expect(bad.isError).toBe(true);
      expect(await countQ()).toBe(0);
      const ok = await call(await connect(() => mgr, 'en', { scope: 'manager' }), name, { taskId: t.id, body: 'x' });
      expect(ok.isError).toBeFalsy();
      expect(await countQ()).toBe(1);
    });

    it('answer_question on a report blocker is denied for member token, nothing changes', async () => {
      const { mgr, rep, t } = await setup();
      const [q] = await testDb.insert(questions).values({
        taskId: t.id, authorId: rep.id, direction: 'member_to_manager', body: 'help', isBlocker: true,
      } as never).returning();
      const bad = await call(await connect(() => mgr, 'en', { scope: 'member' }), 'answer_question', { questionId: q.id, answer: 'a' });
      expect(bad.isError).toBe(true);
      const [mid] = await testDb.select().from(questions).where(eq(questions.id, q.id));
      expect(mid.status).toBe('open');
      const ok = await call(await connect(() => mgr, 'en', { scope: 'manager' }), 'answer_question', { questionId: q.id, answer: 'a' });
      expect(ok.isError).toBeFalsy();
    });

    it('resolve_question on a report task is denied for member token', async () => {
      const { mgr, rep, t } = await setup();
      const [q] = await testDb.insert(questions).values({
        taskId: t.id, authorId: mgr.id, direction: 'manager_to_member', body: 'q', answer: 'a', status: 'answered',
      } as never).returning();
      const bad = await call(await connect(() => mgr, 'en', { scope: 'member' }), 'resolve_question', { questionId: q.id });
      expect(bad.isError).toBe(true);
      const [after] = await testDb.select().from(questions).where(eq(questions.id, q.id));
      expect(after.status).toBe('answered');
      const ok = await call(await connect(() => mgr, 'en', { scope: 'manager' }), 'resolve_question', { questionId: q.id });
      expect(ok.isError).toBeFalsy();
      expect(rep.id).not.toBe(mgr.id);
    });

    it('get_pending_feedback does not leak a report answers to a member token', async () => {
      const { mgr, t } = await setup();
      await testDb.insert(questions).values({
        taskId: t.id, authorId: mgr.id, direction: 'manager_to_member', body: 'q', answer: 'secret-answer', status: 'answered',
      } as never);
      const bad = await call(await connect(() => mgr, 'en', { scope: 'member' }), 'get_pending_feedback');
      expect(text(bad)).not.toContain('secret-answer');
      const ok = await call(await connect(() => mgr, 'en', { scope: 'manager' }), 'get_pending_feedback');
      expect(text(ok)).toContain('secret-answer');
    });

    it('member token can still answer a question on its own task', async () => {
      const { mgr } = await setup();
      const mine = await makeTask(mgr.id, { status: 'in_progress' });
      const [q] = await testDb.insert(questions).values({
        taskId: mine.id, authorId: mgr.id, direction: 'manager_to_member', body: 'q',
      } as never).returning();
      const ok = await call(await connect(() => mgr, 'en', { scope: 'member' }), 'answer_question', { questionId: q.id, answer: 'a' });
      expect(ok.isError).toBeFalsy();
    });

    it('make_task_public on a report task is NOT_FOUND (not ownerOnly) for member token', async () => {
      const { mgr, t } = await setup();
      const r = await call(await connect(() => mgr, 'en', { scope: 'member' }), 'make_task_public', { taskId: t.id });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('not found');
    });
  });

  it('manager-scoped tools are exactly the Global Constraints list', async () => {
    const handlers: Record<string, (a: unknown) => Promise<Res>> = {};
    const stub = { registerTool: (name: string, _c: unknown, h: (a: unknown) => Promise<Res>) => { handlers[name] = h; } };
    const mgr = await makeUser({ level: 'manager' });
    registerTools(stub as never, {
      db: testDb, locale: 'en', getActor: () => mgr,
      tokenScope: 'member', token: { expiresAt: new Date(0), legacy: false },
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const denied: string[] = [];
    for (const [name, h] of Object.entries(handlers)) {
      const r = await h({}).catch(() => null);
      if (r?.isError && r.content[0].text.includes('member access')) denied.push(name);
    }
    spy.mockRestore();
    expect(denied.sort()).toEqual([
      'answer_blocker', 'ask_question', 'confirm_task', 'needs_attention', 'request_changes', 'review_checkpoint',
      'review_solution', 'set_checkpoint_confirmer', 'team_overview', 'weekly_digest',
    ]);
  });
});
