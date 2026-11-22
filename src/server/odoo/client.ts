import { DomainError } from '../errors';

export type OdooConnection = { url: string; database: string; login: string; apiKey: string };
export type OdooEmployee = {
  id: number;
  name: string;
  email: string | null;
  managerId: number | null;
  jobTitle: string | null;
  active: boolean;
};

type Opts = { fetchImpl?: typeof fetch; timeoutMs?: number };

const FIELDS = ['id', 'name', 'work_email', 'parent_id', 'job_title', 'job_id', 'active'];
const bad = () => new DomainError('VALIDATION', 'odooBadResponse');

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const relId = (v: unknown): number | null => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null);
const relName = (v: unknown): string | null => (Array.isArray(v) ? str(v[1]) : null);

function mapEmployee(raw: unknown): OdooEmployee {
  if (!raw || typeof raw !== 'object') throw bad();
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'number' || typeof r.name !== 'string') throw bad();
  return {
    id: r.id,
    name: r.name,
    email: str(r.work_email),
    managerId: relId(r.parent_id),
    jobTitle: str(r.job_title) ?? relName(r.job_id),
    active: r.active !== false,
  };
}

export function createOdooClient(conn: OdooConnection, opts: Opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const endpoint = `${conn.url.trim().replace(/\/+$/, '')}/jsonrpc`;
  let nextId = 1;

  async function rpc(service: string, method: string, args: unknown[]): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: nextId++ }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new DomainError('VALIDATION', 'odooUnreachable');
    }
    let json: unknown;
    try {
      if (!res.ok) throw new Error('http');
      json = await res.json();
    } catch (e) {
      // body read may also time out / drop
      if (e instanceof Error && e.name !== 'SyntaxError' && e.message !== 'http') {
        throw new DomainError('VALIDATION', 'odooUnreachable');
      }
      throw bad();
    }
    if (!json || typeof json !== 'object') throw bad();
    const o = json as Record<string, unknown>;
    if (o.error || !('result' in o)) throw bad();
    return o.result;
  }

  async function listEmployees(): Promise<OdooEmployee[]> {
    const uid = await rpc('common', 'authenticate', [conn.database, conn.login, conn.apiKey, {}]);
    if (uid === false) throw new DomainError('VALIDATION', 'odooAuthFailed');
    if (typeof uid !== 'number') throw bad();
    const result = await rpc('object', 'execute_kw', [
      conn.database, uid, conn.apiKey, 'hr.employee', 'search_read', [[]],
      { fields: FIELDS, context: { active_test: false } },
    ]);
    if (!Array.isArray(result)) throw bad();
    return result.map(mapEmployee);
  }

  return {
    listEmployees,
    async testConnection() {
      return { count: (await listEmployees()).length };
    },
  };
}
