import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../plugins/agentsync/hooks/agentsync-hook.mjs');
type PlanBody = { id: string; status: string; mode: string; statusChangedAt: string; steps: { title: string; status: string }[] };

let server: http.Server;
let port: number;
let requests: { url: string; auth?: string }[];
let respond: (res: http.ServerResponse) => void;
let dir: string;

const plan = (over: Partial<PlanBody> = {}, steps: [string, string][] = [['Step A', 'pending']]): PlanBody => ({
  id: 't1', status: 'in_progress', mode: 'project', statusChangedAt: '2026-01-01T00:00:00.000Z',
  steps: steps.map(([title, status]) => ({ title, status })), ...over,
});
const json = (body: unknown, status = 200) => (res: http.ServerResponse) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

beforeEach(async () => {
  requests = [];
  respond = json(plan());
  dir = mkdtempSync(join(tmpdir(), 'as-hook-'));
  server = http.createServer((req, res) => {
    requests.push({ url: req.url ?? '', auth: req.headers.authorization });
    respond(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});
afterEach(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

function run(payload: object, opts: { env?: Record<string, string | undefined>; agent?: string } = {}) {
  return new Promise<{ stdout: string; code: number | null; ms: number }>((resolveRun) => {
    const t0 = Date.now();
    const env: Record<string, string | undefined> = {
      ...process.env,
      AGENTSYNC_URL: `http://127.0.0.1:${port}`,
      AGENTSYNC_TOKEN: 'secret-token',
      AGENTSYNC_STATE_DIR: dir,
      AGENTSYNC_HOOK: undefined,
      ...opts.env,
    };
    const p = spawn('node', [SCRIPT, '--agent', opts.agent ?? 'claude'], { env: env as NodeJS.ProcessEnv });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.on('close', (code) => resolveRun({ stdout, code, ms: Date.now() - t0 }));
    p.stdin.end(JSON.stringify(payload));
  });
}
const msg = (text: string, extra: object = {}) => ({ session_id: 's1', last_assistant_message: text, ...extra });
const MARK = 'AGENTSYNC-TASK: t1\nAGENTSYNC-CHECKPOINT: Step A';

describe('hook runtime', () => {
  it('no markers → no stdout, exit 0, no HTTP call', async () => {
    const r = await run(msg('hello'));
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it('task + new checkpoint → stdout JSON decision block mentioning the step', async () => {
    const r = await run(msg(MARK));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.decision).toBe('block');
    expect(out.reason).toContain('Step A');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/agent/tasks/t1/plan');
    expect(requests[0].auth).toBe('Bearer secret-token');
  });

  it('new checkpoint with stop_hook_active true → silent; next normal run with no markers → block', async () => {
    const r1 = await run(msg(MARK, { stop_hook_active: true }));
    expect(r1.stdout).toBe('');
    const r2 = await run(msg('no markers'));
    expect(JSON.parse(r2.stdout).reason).toContain('Step A');
  });

  it('server failure keeps the reminder: slow run silent, next run (no markers) blocks', async () => {
    respond = (res) => {
      setTimeout(() => json(plan())(res), 5000).unref();
    };
    const r1 = await run(msg(MARK));
    expect(r1.stdout).toBe('');
    respond = json(plan());
    const r2 = await run(msg('nothing new'));
    expect(JSON.parse(r2.stdout).reason).toContain('Step A');
  }, 15000);

  it('all steps done but status awaiting_review → silent', async () => {
    respond = json(plan({ status: 'awaiting_review' }, [['Step A', 'done']]));
    const r = await run(msg(MARK));
    expect(r.stdout).toBe('');
  });

  it('rotates hook.log to hook.log.1 when over 1MB', async () => {
    writeFileSync(join(dir, 'hook.log'), 'x'.repeat(1024 * 1024 + 10));
    await run(msg(MARK), { env: { AGENTSYNC_TOKEN: undefined } }); // logs missing token
    expect(existsSync(join(dir, 'hook.log.1'))).toBe(true);
    expect(readFileSync(join(dir, 'hook.log'), 'utf8').length).toBeLessThan(1000);
  });

  it('after server shows all done (in_progress) → block reminding completion once; next run silent', async () => {
    await run(msg(MARK));
    respond = json(plan({}, [['Step A', 'done']]));
    const r2 = await run(msg('continuing'));
    expect(JSON.parse(r2.stdout).reason).toContain('set_task_status');
    const r3 = await run(msg('still going'));
    expect(r3.stdout).toBe('');
  });

  it('server returns 401 → clear log line, no token in the log, silent', async () => {
    respond = json({ error: 'unauthorized' }, 401);
    const r = await run(msg(MARK));
    expect(r.stdout).toBe('');
    const log = readFileSync(join(dir, 'hook.log'), 'utf8');
    expect(log).toContain('token rejected: expired, revoked or invalid');
    expect(log).toContain('create a new token in AgentSync Settings');
    expect(log).not.toContain('secret-token');
  });

  it('server returns 404 → silent', async () => {
    respond = json({ error: 'nf' }, 404);
    const r = await run(msg(MARK));
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
  });

  it('new session with task marker only: server all done + in_progress -> completion reminder once', async () => {
    respond = json(plan({}, [['Step A', 'done']]));
    const r1 = await run(msg('AGENTSYNC-TASK: t1'));
    expect(JSON.parse(r1.stdout).reason).toContain('set_task_status');
    const r2 = await run(msg('next'));
    expect(r2.stdout).toBe('');
  });

  it('last_assistant_message is scanned even when the transcript lacks the final message', async () => {
    const tp = join(dir, 'tr2.jsonl');
    writeFileSync(tp, [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'go' } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'AGENTSYNC-TASK: t1' }] } }),
    ].join('\n'));
    const r = await run({ session_id: 's1', transcript_path: tp, last_assistant_message: 'AGENTSYNC-CHECKPOINT: Step A' });
    expect(JSON.parse(r.stdout).reason).toContain('Step A');
  });

  it('404 is decided: no retry on the next turn', async () => {
    respond = json({ error: 'nf' }, 404);
    await run(msg(MARK));
    expect(requests).toHaveLength(1);
    await run(msg('again'));
    expect(requests).toHaveLength(1);
  });

  it('server delays 5s → exits silently within 4.5s', async () => {
    respond = (res) => {
      setTimeout(() => json(plan())(res), 5000).unref();
    };
    const r = await run(msg(MARK));
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(4500);
  }, 10000);

  it('missing AGENTSYNC_TOKEN → silent', async () => {
    const r = await run(msg(MARK), { env: { AGENTSYNC_TOKEN: undefined } });
    expect(r.stdout).toBe('');
    expect(requests).toHaveLength(0);
  });

  it('AGENTSYNC_HOOK=off → silent, no HTTP', async () => {
    const r = await run(msg(MARK), { env: { AGENTSYNC_HOOK: 'off' } });
    expect(r.stdout).toBe('');
    expect(requests).toHaveLength(0);
  });

  it('no transcript_path, last_assistant_message has markers → works', async () => {
    const r = await run({ session_id: 's1', last_assistant_message: MARK });
    expect(JSON.parse(r.stdout).decision).toBe('block');
  });

  it('transcript_path with markers is preferred; unreadable path falls back to last_assistant_message', async () => {
    const tp = join(dir, 'tr.jsonl');
    writeFileSync(tp, [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'go' } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: MARK }] } }),
    ].join('\n'));
    const r = await run({ session_id: 's1', transcript_path: tp });
    expect(JSON.parse(r.stdout).decision).toBe('block');
    const r2 = await run({ session_id: 's2', transcript_path: join(dir, 'missing'), last_assistant_message: MARK });
    expect(JSON.parse(r2.stdout).decision).toBe('block');
  });

  it('corrupted state.json → silent and state rewritten valid on next run', async () => {
    writeFileSync(join(dir, 'state.json'), '{not json');
    const r = await run(msg('hello'));
    expect(r.stdout).toBe('');
    const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
    expect(state.sessions.s1.tasks).toEqual({});
  });

  it('old-shape session entries are treated as fresh; token never written to disk', async () => {
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ sessions: { s1: { taskId: 't1', claimed: ['x'], reminded: [] } } }));
    await run(msg(MARK));
    const state = readFileSync(join(dir, 'state.json'), 'utf8');
    expect(state).not.toContain('secret-token');
    if (existsSync(join(dir, 'hook.log'))) expect(readFileSync(join(dir, 'hook.log'), 'utf8')).not.toContain('secret-token');
  });

  it('prunes sessions older than 7 days', async () => {
    const old = { tasks: {}, outstanding: false, updatedAt: '2020-01-01T00:00:00.000Z' };
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ sessions: { stale: old } }));
    await run(msg('hi'));
    const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
    expect(state.sessions.stale).toBeUndefined();
    expect(state.sessions.s1).toBeDefined();
  });

  it('--agent codex block output matches the documented Codex Stop block format', async () => {
    const r = await run(msg(MARK), { agent: 'codex' });
    const out = JSON.parse(r.stdout);
    expect(Object.keys(out).sort()).toEqual(['decision', 'reason']);
    expect(out.decision).toBe('block');
    expect(typeof out.reason).toBe('string');
    expect(r.code).toBe(0);
  });

  it('--agent antigravity output uses the documented continue shape', async () => {
    const r = await run(msg(MARK), { agent: 'antigravity' });
    const out = JSON.parse(r.stdout);
    expect(Object.keys(out).sort()).toEqual(['decision', 'reason']);
    expect(out.decision).toBe('continue');
    expect(typeof out.reason).toBe('string');
    expect(r.code).toBe(0);
  });

  it('--agent antigravity prints {} on no-op and error paths; claude prints nothing', async () => {
    const noop = await run(msg('hello'), { agent: 'antigravity' });
    expect(JSON.parse(noop.stdout)).toEqual({});
    expect(noop.code).toBe(0);
    const missing = await run(msg(MARK), { agent: 'antigravity', env: { AGENTSYNC_TOKEN: undefined } });
    expect(JSON.parse(missing.stdout)).toEqual({});
    expect((await run(msg('hello', { session_id: 'other' }), { agent: 'codex' })).stdout).toBe('');
  });
});
