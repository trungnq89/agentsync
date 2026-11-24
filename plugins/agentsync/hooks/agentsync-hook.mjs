// AgentSync checkpoint Stop hook. Zero dependencies (node: built-ins only), Node >= 20.
// This part: pure decision logic. IO/main lives elsewhere.

/**
 * @typedef {{ claimed: string[], reminded: string[], completionRemindedAt?: string }} TaskState
 * @typedef {{ currentTaskId?: string, tasks: Record<string, TaskState>, outstanding: boolean, updatedAt: string }} Session
 * @typedef {{ id: string, status: string, mode: string, effectiveConfirmer?: string, statusChangedAt: string, steps: { title: string, status: string }[] }} Plan
 * @typedef {{ type: 'none' } | { type: 'remindSteps', steps: string[], confirmer: 'member' | 'manager' } | { type: 'remindComplete', mode: 'project' | 'executive' }} Action
 * @typedef {{ taskIds: string[], checkpoints: string[], events: { kind: 'task' | 'checkpoint', value: string }[] }} Markers
 */

const REMIND_STATUSES = ['pending_confirmation', 'in_progress', 'changes_requested'];
const TERMINAL_STATUSES = ['done', 'closed', 'cancelled'];

/**
 * @param {string} text
 * @returns {Markers}
 */
export function parseMarkers(text) {
  const taskIds = [];
  const checkpoints = [];
  /** @type {Markers['events']} */
  const events = [];
  // Tolerated wrappers: leading "- ", "* ", "> " (repeatable), then optional ** or `; the same
  // wrapper may close the line. The captured title excludes all wrappers.
  const re = /^[ \t]*(?:[>*-][ \t]+)*(\*\*|`)?AGENTSYNC-(TASK|CHECKPOINT):(?:\*\*)?[ \t]*(.+?)[ \t]*\r?$/gm;
  for (const m of String(text ?? '').matchAll(re)) {
    let value = m[3];
    if (m[1] && value.endsWith(m[1])) value = value.slice(0, -m[1].length).trimEnd();
    if (!value) continue;
    if (m[2] === 'TASK') {
      if (/\s/.test(value)) continue;
      taskIds.push(value);
      events.push({ kind: 'task', value });
    } else {
      checkpoints.push(value);
      events.push({ kind: 'checkpoint', value });
    }
  }
  return { taskIds, checkpoints, events };
}

/**
 * Assistant text blocks since the most recent real user message of a Claude Code JSONL transcript.
 * Meta and sidechain lines are ignored.
 * @param {string} transcript
 * @returns {string[]}
 */
export function turnAssistantTexts(transcript) {
  /** @type {string[]} */
  let texts = [];
  for (const line of String(transcript ?? '').split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object' || obj.isMeta === true || obj.isSidechain === true) continue;
    const msg = obj.message;
    if (!msg || typeof msg !== 'object') continue;
    const content = msg.content;
    if (obj.type === 'user') {
      const real =
        typeof content === 'string'
          ? content.length > 0
          : Array.isArray(content) && content.some((b) => b && b.type !== 'tool_result');
      if (real) texts = [];
    } else if (obj.type === 'assistant') {
      if (typeof content === 'string') texts.push(content);
      else if (Array.isArray(content)) {
        for (const b of content) if (b && b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
      }
    }
  }
  return texts;
}

/**
 * Apply markers in textual order: a checkpoint belongs to the most recent task marker before it
 * (or the session's current task). Per-task state is kept across task switches.
 * @param {Session} session
 * @param {Markers} markers
 * @returns {{ session: Session, newCheckpoints: string[] }}
 */
export function applyTurn(session, markers) {
  /** @type {Record<string, TaskState>} */
  const tasks = { ...session.tasks };
  let current = session.currentTaskId;
  let outstanding = session.outstanding;
  /** @type {Record<string, string[]>} */
  const added = {};
  for (const ev of markers.events) {
    if (ev.kind === 'task') {
      if (ev.value !== current) outstanding = true; // check the server once for a newly linked task
      current = ev.value;
      if (!tasks[current]) tasks[current] = { claimed: [], reminded: [] };
    } else if (current) {
      const t = ev.value.trim();
      const st = tasks[current] ?? { claimed: [], reminded: [] };
      if (t && !st.claimed.includes(t)) {
        tasks[current] = { ...st, claimed: [...st.claimed, t] };
        (added[current] ??= []).push(t);
      }
    }
  }
  return {
    session: { ...session, currentTaskId: current, tasks, outstanding },
    newCheckpoints: current ? (added[current] ?? []) : [],
  };
}

/**
 * @param {Session} session
 * @param {Plan | null} plan
 * @param {{ stopHookActive: boolean }} opts
 * @returns {{ session: Session, action: Action }}
 */
export function decide(session, plan, opts) {
  const none = { type: /** @type {const} */ ('none') };
  const id = session.currentTaskId;
  if (plan === null || !id) return { session, action: none };
  const ts = session.tasks[id] ?? { claimed: [], reminded: [] };

  /** @type {Map<string, { original: string, done: boolean, handled: boolean, awaiting: boolean }>} */
  const byTitle = new Map();
  // Nobody can approve a leftover pending step when the member is the effective confirmer: treat it as unreported.
  const managerConfirms = plan.effectiveConfirmer !== 'member';
  const steps = plan.steps.filter((st) => st && typeof st.title === 'string');
  for (const st of steps) {
    const key = st.title.trim();
    const prev = byTitle.get(key);
    byTitle.set(key, {
      original: prev ? prev.original : st.title,
      done: (prev ? prev.done : true) && st.status === 'done',
      // pending_approval counts as reported: the agent has nothing left to send for it.
      handled: (prev ? prev.handled : true) && (st.status === 'done' || (st.status === 'pending_approval' && managerConfirms)),
      awaiting: (prev ? prev.awaiting : true) && st.status === 'pending_approval' && managerConfirms,
    });
  }
  // A step waiting for approval is released from the claim: only a re-printed marker (after a rejection) re-claims it.
  const claimed = ts.claimed.filter((c) => !byTitle.get(c)?.awaiting);
  const pendingKeys = claimed.filter((c) => byTitle.has(c) && !byTitle.get(c)?.handled);
  const allDone = steps.length > 0 && steps.every((st) => st.status === 'done');
  const outstanding = pendingKeys.length > 0 || (allDone && !TERMINAL_STATUSES.includes(plan.status));
  const keptReminded = ts.reminded.filter((r) => pendingKeys.includes(r));

  /** @param {Partial<TaskState>} patch @param {Action} action */
  const out = (patch, action) => ({
    session: { ...session, outstanding, tasks: { ...session.tasks, [id]: { ...ts, claimed, reminded: keptReminded, ...patch } } },
    action,
  });

  if (opts.stopHookActive || !REMIND_STATUSES.includes(plan.status)) return out({}, none);

  if (pendingKeys.some((c) => !ts.reminded.includes(c))) {
    return out({ reminded: [...pendingKeys] }, {
      type: 'remindSteps',
      confirmer: managerConfirms ? 'manager' : 'member',
      steps: pendingKeys.map((c) => byTitle.get(c)?.original ?? c),
    });
  }
  if (pendingKeys.length === 0 && plan.status === 'in_progress' && allDone && ts.completionRemindedAt !== plan.statusChangedAt) {
    return out({ completionRemindedAt: plan.statusChangedAt }, {
      type: 'remindComplete',
      mode: plan.mode === 'executive' ? 'executive' : 'project',
    });
  }
  return out({}, none);
}

/**
 * @param {Action} action
 * @returns {string}
 */
export function reasonFor(action) {
  if (action.type === 'remindSteps') {
    const list = action.steps.map((s) => `- ${s}`).join('\n');
    return [
      'AgentSync: you reported these plan steps as finished, but they are not marked done on the server:',
      list,
      'Call update_progress with stepsCompleted set to exactly these step titles (copy them verbatim) and a short progress note.',
      action.confirmer === 'member'
        ? 'These steps go to the member: ask the member whether they are done, and once they say yes call update_progress with memberConfirmed: true.'
        : 'Omit memberConfirmed: the steps go to the manager, so wait for manager approval.',
      'If your send mode is review, show the member the draft and wait for approval first.',
    ].join('\n');
  }
  if (action.type === 'remindComplete') {
    const review = 'If your send mode is review, show the member the draft and wait for approval first.';
    if (action.mode === 'executive') {
      return `AgentSync: every plan step is done. Finish the task now: call set_task_status with action "complete".\n${review}`;
    }
    return `AgentSync: every plan step is done. Finish the task now: call submit_solution_summary with a summary of the solution, then call set_task_status with action "complete".\n${review}`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Runtime (IO, network, per-agent output). Everything below fails silently.
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
const LOG_MAX_BYTES = 1024 * 1024;

/**
 * Block output format per agent.
 * - claude: https://code.claude.com/docs/en/hooks (Stop: {"decision":"block","reason":...}).
 * - codex: https://learn.chatgpt.com/docs/hooks.md (verified): Stop reads JSON on stdin with
 *   session_id, transcript_path (format "not a stable interface"), stop_hook_active,
 *   last_assistant_message (string|null). Block = exit 0 + stdout {"decision":"block","reason":...};
 *   reason becomes the continuation prompt. Plain text on stdout is invalid.
 * - antigravity: https://antigravity.google/docs/build-plugins/ : exit 0 and stdout
 *   {"decision":"continue","reason":...} prevents completion and keeps the agent running
 *   ({} allows the stop). Stop stdin payload fields are not documented; not tested on a real install.
 * @param {string} agent
 * @param {string} reason
 * @returns {string}
 */
export function blockOutput(agent, reason) {
  return JSON.stringify({ decision: agent === 'antigravity' ? 'continue' : 'block', reason });
}

/**
 * Normalize a possibly old/malformed state session; never throws.
 * @param {any} s
 * @returns {Session | null} null => treat as fresh
 */
export function normalizeSession(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  if (s.tasks !== undefined && (typeof s.tasks !== 'object' || s.tasks === null || Array.isArray(s.tasks))) return null;
  if (s.tasks === undefined && ('claimed' in s || 'reminded' in s)) return null; // pre-C3 shape
  /** @type {Record<string, TaskState>} */
  const tasks = {};
  for (const [id, t] of Object.entries(s.tasks ?? {})) {
    if (!t || typeof t !== 'object') continue;
    const o = /** @type {any} */ (t);
    if (!Array.isArray(o.claimed) || !Array.isArray(o.reminded)) continue;
    tasks[id] = {
      claimed: o.claimed.filter((x) => typeof x === 'string'),
      reminded: o.reminded.filter((x) => typeof x === 'string'),
      ...(typeof o.completionRemindedAt === 'string' ? { completionRemindedAt: o.completionRemindedAt } : {}),
    };
  }
  const updatedAt = typeof s.updatedAt === 'string' ? s.updatedAt : new Date(0).toISOString();
  return {
    currentTaskId: typeof s.currentTaskId === 'string' ? s.currentTaskId : undefined,
    tasks,
    outstanding: s.outstanding === true,
    updatedAt,
  };
}

/**
 * @param {string} raw
 * @param {number} now
 * @returns {{ sessions: Record<string, Session> }}
 */
export function loadState(raw, now) {
  /** @type {Record<string, Session>} */
  const sessions = {};
  try {
    const parsed = JSON.parse(raw);
    const src = parsed && typeof parsed === 'object' ? parsed.sessions : null;
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (const [id, s] of Object.entries(src)) {
        const n = normalizeSession(s);
        if (!n) continue;
        const t = Date.parse(n.updatedAt);
        if (Number.isFinite(t) && now - t > SESSION_TTL_MS) continue;
        sessions[id] = n;
      }
    }
  } catch {
    /* corrupted: start fresh */
  }
  return { sessions };
}

async function main() {
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const fs = await import('node:fs');
  const env = process.env;
  if (env.AGENTSYNC_HOOK === 'off') return;
  setTimeout(() => {
    emptyForAntigravity();
    process.exit(0);
  }, 4000).unref(); // watchdog: bound total runtime

  const stateDir = env.AGENTSYNC_STATE_DIR || join(homedir(), '.agentsync');
  const logFile = join(stateDir, 'hook.log');
  /** @param {string} msg */
  const log = (msg) => {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      try {
        if (fs.statSync(logFile).size > LOG_MAX_BYTES) fs.renameSync(logFile, logFile + '.1');
      } catch {
        /* no log yet */
      }
      const safe = env.AGENTSYNC_TOKEN ? String(msg).split(env.AGENTSYNC_TOKEN).join('[redacted]') : String(msg);
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${safe}\n`);
    } catch {
      /* ignore */
    }
  };

  try {
    const agentIdx = process.argv.indexOf('--agent');
    const agent = agentIdx > -1 ? process.argv[agentIdx + 1] : 'claude';

    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    /** @type {any} */
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const sessionId = typeof input.session_id === 'string' ? input.session_id : '';
    if (!sessionId) return;

    // Turn text: transcript first (Claude JSONL); fall back to last_assistant_message
    // (Codex transcript format is documented as unstable).
    /** @type {string[]} */
    let texts = [];
    if (typeof input.transcript_path === 'string') {
      try {
        texts = turnAssistantTexts(fs.readFileSync(input.transcript_path, 'utf8'));
      } catch {
        texts = [];
      }
    }
    if (typeof input.last_assistant_message === 'string') texts = [...texts, input.last_assistant_message];
    const markers = parseMarkers(texts.join('\n'));

    const now = Date.now();
    const statePath = join(stateDir, 'state.json');
    let raw = '';
    try {
      raw = fs.readFileSync(statePath, 'utf8');
    } catch {
      /* none yet */
    }
    const state = loadState(raw, now);
    const prev = state.sessions[sessionId] ?? { tasks: {}, outstanding: false, updatedAt: new Date(now).toISOString() };

    const applied = applyTurn(prev, markers);
    let session = applied.session;

    const url = env.AGENTSYNC_URL;
    const token = env.AGENTSYNC_TOKEN;
    /** @type {Action} */
    let action = { type: 'none' };
    let decided = false;
    let gone = false;
    const needServer = !!session.currentTaskId && (applied.newCheckpoints.length > 0 || session.outstanding);
    if (needServer) {
      if (url && token) {
        /** @type {Plan | null} */
        let plan = null;
        try {
          const res = await fetch(`${url.replace(/\/+$/, '')}/api/agent/tasks/${encodeURIComponent(session.currentTaskId)}/plan`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(3000),
          });
          if (res.status === 200) plan = await res.json();
          else {
            if (res.status === 404) gone = true; // decided: task unknown/not ours, do not retry every turn
            log(res.status === 401
              ? 'token rejected: expired, revoked or invalid — create a new token in AgentSync Settings'
              : `plan fetch status ${res.status}`);
          }
        } catch (e) {
          log(`plan fetch failed: ${e instanceof Error ? e.name : 'error'}`);
        }
        if (plan && Array.isArray(plan.steps)) {
          const d = decide(session, plan, { stopHookActive: input.stop_hook_active === true });
          session = d.session;
          action = d.action;
          decided = true;
        }
      } else {
        log('missing AGENTSYNC_URL or AGENTSYNC_TOKEN');
      }
    }

    // Server needed but no decision (timeout/non-200/bad JSON/missing env): retry next turn.
    if (needServer && !decided) session = { ...session, outstanding: !gone };
    session = { ...session, updatedAt: new Date(now).toISOString() };
    const tmp = `${statePath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      // Re-read right before writing so concurrent sessions' entries are not clobbered.
      let fresh = '';
      try {
        fresh = fs.readFileSync(statePath, 'utf8');
      } catch {
        /* none */
      }
      const merged = loadState(fresh, Date.now());
      merged.sessions[sessionId] = session;
      fs.writeFileSync(tmp, JSON.stringify(merged));
      fs.renameSync(tmp, statePath);
    } catch (e) {
      log(`state write failed: ${e instanceof Error ? e.name : 'error'}`);
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }

    if (action.type !== 'none') {
      printed = true;
      await new Promise((r) => process.stdout.write(blockOutput(agent, reasonFor(action)) + '\n', () => r(undefined)));
    }
  } catch (e) {
    log(`hook error: ${e instanceof Error ? e.name : 'error'}`);
  }
}

// Exception to "silent on no-op/error": Antigravity requires a JSON object on stdout with exit 0
// (https://antigravity.google/docs/build-plugins/), so for --agent antigravity only we print `{}`
// (allow the stop) whenever nothing else was printed. claude/codex print nothing.
let printed = false;
function emptyForAntigravity() {
  const i = process.argv.indexOf('--agent');
  if (!printed && i > -1 && process.argv[i + 1] === 'antigravity') {
    printed = true;
    try {
      process.stdout.write('{}\n');
    } catch {
      /* ignore */
    }
  }
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
let isMain = false;
try {
  isMain = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isMain = false;
}
if (isMain) {
  main().finally(() => {
    emptyForAntigravity();
    process.exitCode = 0; // let stdout flush; the watchdog bounds runtime
  });
}
