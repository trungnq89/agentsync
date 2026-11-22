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
  if (typeof r.id !== 'number' || typeof r.name !== 'string' || typeof r.active !== 'boolean') throw bad();
  return {
    id: r.id,
    name: r.name,
    email: str(r.work_email),
    managerId: relId(r.parent_id),
    jobTitle: str(r.job_title) ?? relName(r.job_id),
    active: r.active,
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
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new DomainError('VALIDATION', 'odooUnreachable');
    }
    // Redirects are never followed (the API key must not be re-POSTed elsewhere): any non-2xx is bad.
    if (!res.ok) throw bad();
    let text: string;
    try {
      text = await res.text();
    } catch {
      // body read timed out / connection dropped
      throw new DomainError('VALIDATION', 'odooUnreachable');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
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
