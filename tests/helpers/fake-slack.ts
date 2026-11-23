import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeSlackFail = { method: string; error?: string; status?: number; retryAfter?: number };

type Opts = {
  token: string;
  usersByEmail: Record<string, string>;
  failNext?: FakeSlackFail;
  /** Delay every response (used to exercise client timeouts). */
  delayMs?: number;
  /** Fixed port (default: random). */
  port?: number;
};

export type FakeSlackPost = { channel: string; text: string; blocks?: unknown[] };

export async function startFakeSlack(opts: Opts) {
  let failNext = opts.failNext;
  const posts: FakeSlackPost[] = [];
  const lookups: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const reply = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
        const send = () => {
          res.writeHead(status, { 'content-type': 'application/json', ...headers });
          res.end(JSON.stringify(payload));
        };
        if (opts.delayMs) setTimeout(send, opts.delayMs);
        else send();
      };
      // Test control endpoints (no auth): GET /__posts lists received messages, POST /__reset clears them.
      if (req.url === '/__posts') return reply(200, { posts });
      if (req.url === '/__reset') { posts.length = 0; lookups.length = 0; return reply(200, { ok: true }); }
      const method = (req.url ?? '').replace(/^\/+/, '').split('?')[0];
      if (req.headers.authorization !== `Bearer ${opts.token}`) return reply(200, { ok: false, error: 'invalid_auth' });
      if (failNext && failNext.method === method) {
        const f = failNext;
        failNext = undefined;
        if (f.status) {
          return reply(f.status, { ok: false, error: f.error ?? (f.status === 429 ? 'ratelimited' : 'internal_error') }, f.retryAfter !== undefined ? { 'retry-after': String(f.retryAfter) } : {});
        }
        return reply(200, { ok: false, error: f.error ?? 'internal_error' });
      }
      let params: Record<string, unknown> = {};
      const ct = String(req.headers['content-type'] ?? '');
      try {
        if (ct.includes('application/json')) params = body ? JSON.parse(body) : {};
        else params = Object.fromEntries(new URLSearchParams(body));
      } catch {
        return reply(200, { ok: false, error: 'invalid_json' });
      }
      if (req.method !== 'POST') return reply(200, { ok: false, error: 'invalid_method' });
      if (method === 'auth.test') return reply(200, { ok: true, team: 'Acme Team', user: 'agentsync-bot' });
      if (method === 'users.lookupByEmail') {
        // Like Slack, this method ignores JSON bodies (only form/query params count).
        if (ct.includes('application/json')) params = {};
        const email = String(params.email ?? '');
        lookups.push(email);
        const id = opts.usersByEmail[email];
        return reply(200, id ? { ok: true, user: { id } } : { ok: false, error: 'users_not_found' });
      }
      if (method === 'chat.postMessage') {
        if (typeof params.channel !== 'string' || typeof params.text !== 'string') return reply(200, { ok: false, error: 'invalid_arguments' });
        posts.push({ channel: params.channel, text: params.text, blocks: params.blocks as unknown[] | undefined });
        return reply(200, { ok: true, ts: '1.1' });
      }
      return reply(404, { ok: false, error: 'unknown_method' });
    });
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    posts,
    lookups,
    failNext(f: FakeSlackFail) { failNext = f; },
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
