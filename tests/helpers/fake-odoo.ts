import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeOdooEmployee = {
  id: number;
  name: string;
  work_email: string | false;
  parent_id: [number, string] | false;
  job_title: string | false;
  job_id: [number, string] | false;
  active: boolean;
};

type Opts = {
  db: string;
  login: string;
  apiKey: string;
  employees: FakeOdooEmployee[];
  delayMs?: number;
};

const FIELDS = ['id', 'name', 'work_email', 'parent_id', 'job_title', 'job_id', 'active'];
const UID = 7;

export async function startFakeOdoo(opts: Opts) {
  let employees = opts.employees;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const reply = (payload: unknown) => {
        const send = () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(payload));
        };
        if (opts.delayMs) setTimeout(send, opts.delayMs);
        else send();
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let msg: any;
      try { msg = JSON.parse(body); } catch { return reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
      const id = msg?.id ?? null;
      const rpcError = (message: string) => reply({ jsonrpc: '2.0', id, error: { code: 200, message, data: { message } } });
      if (req.method !== 'POST' || req.url !== '/jsonrpc') return rpcError('bad endpoint');
      const p = msg?.params;
      if (msg?.method !== 'call' || !p) return rpcError('bad call');
      const a = p.args;
      if (p.service === 'common' && p.method === 'authenticate') {
        if (!Array.isArray(a) || a.length !== 4 || a[0] !== opts.db) return rpcError('bad args');
        if (typeof a[3] !== 'object' || a[3] === null || Object.keys(a[3]).length) return rpcError('bad args');
        return reply({ jsonrpc: '2.0', id, result: a[1] === opts.login && a[2] === opts.apiKey ? UID : false });
      }
      if (p.service === 'object' && p.method === 'execute_kw') {
        if (!Array.isArray(a) || a.length !== 7) return rpcError('bad args');
        const [db, uid, key, model, fn, args, kw] = a;
        if (db !== opts.db || uid !== UID || key !== opts.apiKey) return rpcError('access denied');
        if (model !== 'hr.employee' || fn !== 'search_read') return rpcError('unsupported call');
        if (JSON.stringify(args) !== '[[]]') return rpcError('bad domain');
        if (JSON.stringify(kw?.fields) !== JSON.stringify(FIELDS) || JSON.stringify(kw?.context) !== '{"active_test":false}') return rpcError('bad kwargs');
        return reply({ jsonrpc: '2.0', id, result: employees });
      }
      return rpcError('unknown service/method');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    setEmployees(e: FakeOdooEmployee[]) { employees = e; },
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
