import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { eq } from 'drizzle-orm';
import { users, type User } from '@/db/schema';
import { registerTools } from '@/mcp/tools';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

async function connect(getActor: () => User) {
  const server = new McpServer({ name: 'test', version: '0' });
  registerTools(server, { db: testDb, getActor });
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

  it('get_my_settings returns sendMode, displayName, level', async () => {
    const me = await makeUser({ displayName: 'Lan', sendMode: 'auto' });
    const r = await call(await connect(() => me), 'get_my_settings');
    expect(JSON.parse(r.content[1].text)).toEqual({ sendMode: 'auto', displayName: 'Lan', level: 'member' });
  });

  it('non-domain errors are not leaked', async () => {
    const me = await makeUser();
    const c = await connect(() => me);
    const spy = (await import('vitest')).vi.spyOn(console, 'error').mockImplementation(() => {});
    const orig = testDb.select;
    testDb.select = (() => { throw new Error('SELECT secret FROM sql'); }) as never;
    const r = await call(c, 'list_my_tasks');
    testDb.select = orig;
    expect(r.isError).toBe(true);
    expect(text(r)).not.toContain('secret');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
