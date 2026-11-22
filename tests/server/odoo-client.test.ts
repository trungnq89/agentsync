import { afterEach, describe, expect, it } from 'vitest';
import { createOdooClient } from '@/server/odoo/client';
import { DomainError } from '@/server/errors';
import { startFakeOdoo, type FakeOdooEmployee } from '../helpers/fake-odoo';

const KEY = 'super-secret-api-key';
const emps: FakeOdooEmployee[] = [
  { id: 1, name: 'Ann', work_email: 'ann@x.com', parent_id: false, job_title: 'CTO', job_id: false, active: true },
  { id: 2, name: 'Bob', work_email: false, parent_id: [1, 'Ann'], job_title: false, job_id: [9, 'Developer'], active: false },
];
let fake: Awaited<ReturnType<typeof startFakeOdoo>> | undefined;
afterEach(async () => { await fake?.close(); fake = undefined; });
const conn = (url: string, apiKey = KEY) => ({ url, database: 'db', login: 'me', apiKey });
async function rejects(p: Promise<unknown>) {
  try { await p; } catch (e) { return e as DomainError; }
  throw new Error('expected rejection');
}

describe('odoo client', () => {
  it('lists employees and maps fields (job_id fallback, false→null)', async () => {
    fake = await startFakeOdoo({ db: 'db', login: 'me', apiKey: KEY, employees: emps });
    const list = await createOdooClient(conn(fake.url + '/')).listEmployees();
    expect(list).toEqual([
      { id: 1, name: 'Ann', email: 'ann@x.com', managerId: null, jobTitle: 'CTO', active: true },
      { id: 2, name: 'Bob', email: null, managerId: 1, jobTitle: 'Developer', active: false },
    ]);
  });
  it('wrong key → odooAuthFailed', async () => {
    fake = await startFakeOdoo({ db: 'db', login: 'me', apiKey: KEY, employees: emps });
    const e = await rejects(createOdooClient(conn(fake.url, 'wrong')).listEmployees());
    expect(e.key).toBe('odooAuthFailed');
  });
  it('unreachable url → odooUnreachable', async () => {
    const e = await rejects(createOdooClient(conn('http://127.0.0.1:1')).listEmployees());
    expect(e.key).toBe('odooUnreachable');
  });
  it('delay beyond timeout → odooUnreachable', async () => {
    fake = await startFakeOdoo({ db: 'db', login: 'me', apiKey: KEY, employees: emps, delayMs: 300 });
    const e = await rejects(createOdooClient(conn(fake.url), { timeoutMs: 50 }).listEmployees());
    expect(e.key).toBe('odooUnreachable');
  });
  it('rpc error → odooBadResponse', async () => {
    fake = await startFakeOdoo({ db: 'other', login: 'me', apiKey: KEY, employees: emps });
    const e = await rejects(createOdooClient(conn(fake.url)).listEmployees());
    expect(e.key).toBe('odooBadResponse');
  });
  it('testConnection returns count', async () => {
    fake = await startFakeOdoo({ db: 'db', login: 'me', apiKey: KEY, employees: emps });
    expect(await createOdooClient(conn(fake.url)).testConnection()).toEqual({ count: 2 });
  });
  it('error message never contains the api key', async () => {
    fake = await startFakeOdoo({ db: 'db', login: 'me', apiKey: 'other', employees: emps });
    const e = await rejects(createOdooClient(conn(fake.url)).listEmployees());
    expect(JSON.stringify([e.message, e.key, e.params, e.stack])).not.toContain(KEY);
    const e2 = await rejects(createOdooClient(conn('http://127.0.0.1:1')).listEmployees());
    expect(JSON.stringify([e2.message, e2.key, e2.params])).not.toContain(KEY);
  });

  describe('hardening', () => {
    const stub = (res: () => Response | Promise<Response>) => ({ fetchImpl: (async () => res()) as unknown as typeof fetch });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    it('HTML body → odooBadResponse', async () => {
      const e = await rejects(createOdooClient(conn('http://x'), stub(() => new Response('<html>', { status: 200 }))).listEmployees());
      expect(e.key).toBe('odooBadResponse');
    });
    it('non-2xx → odooBadResponse', async () => {
      const e = await rejects(createOdooClient(conn('http://x'), stub(() => new Response('{}', { status: 500 }))).listEmployees());
      expect(e.key).toBe('odooBadResponse');
    });
    it('3xx is not followed → odooBadResponse; fetch called with redirect manual', async () => {
      let init: RequestInit | undefined;
      const fetchImpl = (async (_u: string, i: RequestInit) => { init = i; return new Response(null, { status: 302, headers: { location: 'http://evil' } }); }) as unknown as typeof fetch;
      const e = await rejects(createOdooClient(conn('http://x'), { fetchImpl }).listEmployees());
      expect(e.key).toBe('odooBadResponse');
      expect(init?.redirect).toBe('manual');
    });
    it('non-array result → odooBadResponse', async () => {
      let n = 0;
      const e = await rejects(createOdooClient(conn('http://x'), stub(() => ok({ jsonrpc: '2.0', id: 1, result: n++ === 0 ? 7 : { a: 1 } }))).listEmployees());
      expect(e.key).toBe('odooBadResponse');
    });
    it('non-boolean active → odooBadResponse', async () => {
      let n = 0;
      const row = { id: 1, name: 'A', work_email: false, parent_id: false, job_title: false, job_id: false, active: 'yes' };
      const e = await rejects(createOdooClient(conn('http://x'), stub(() => ok({ result: n++ === 0 ? 7 : [row] }))).listEmployees());
      expect(e.key).toBe('odooBadResponse');
    });
    it('timeout during body read → odooUnreachable', async () => {
      const body = new ReadableStream({ start(c) { c.error(new DOMException('timed out', 'TimeoutError')); } });
      const e = await rejects(createOdooClient(conn('http://x'), stub(() => new Response(body, { status: 200 }))).listEmployees());
      expect(e.key).toBe('odooUnreachable');
    });
    it('rpc error with data.debug containing a secret does not leak', async () => {
      const e = await rejects(createOdooClient(conn('http://x'), stub(() => ok({ error: { message: 'x', data: { debug: `trace ${KEY}` } } }))).listEmployees());
      expect(e.key).toBe('odooBadResponse');
      expect(JSON.stringify([e.message, e.key, e.params, e.stack])).not.toContain(KEY);
    });
  });
});
