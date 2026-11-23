import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { eq } from 'drizzle-orm';
import { users, type User } from '@/db/schema';
import { registerTools } from '@/mcp/tools';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

async function connect(getActor: () => User, locale: 'en' | 'vi' = 'vi') {
  const server = new McpServer({ name: 'test', version: '0' });
  registerTools(server, { db: testDb, getActor, locale });
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
    expect(JSON.parse(r.content[1].text)).toEqual({ sendMode: 'auto', displayName: 'Lan', level: 'member', checkpointConfirmer: 'member' });
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
      expect(d.plan.steps[0]).toMatchObject({ title: 'A', status: 'done', confirmedBy: 'member', confirmedById: me.id });
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
    });

    it('repeat approve-all is an informative non-error', async () => {
      const { t, member, manager } = await world('manager');
      await call(member, 'update_progress', { taskId: t.id, body: 'x', stepsCompleted: ['A'], source: 'auto' });
      expect((await call(manager, 'review_checkpoint', { taskId: t.id, decision: 'approved' })).isError).toBeFalsy();
      const again = await call(manager, 'review_checkpoint', { taskId: t.id, decision: 'approved' });
      expect(again.isError).toBeFalsy();
      expect(text(again)).toContain('No step is waiting');
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
});
