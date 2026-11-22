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
});
