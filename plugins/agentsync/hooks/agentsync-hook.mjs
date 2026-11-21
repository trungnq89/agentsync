// AgentSync checkpoint Stop hook. Zero dependencies (node: built-ins only), Node >= 20.
// This part: pure decision logic. IO/main lives elsewhere.

/**
 * @typedef {{ claimed: string[], reminded: string[], completionRemindedAt?: string }} TaskState
 * @typedef {{ currentTaskId?: string, tasks: Record<string, TaskState>, outstanding: boolean, updatedAt: string }} Session
 * @typedef {{ id: string, status: string, mode: string, statusChangedAt: string, steps: { title: string, status: string }[] }} Plan
 * @typedef {{ type: 'none' } | { type: 'remindSteps', steps: string[] } | { type: 'remindComplete', mode: 'project' | 'executive' }} Action
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
  const re = /^[ \t]*AGENTSYNC-(TASK|CHECKPOINT):[ \t]*(.+?)[ \t]*\r?$/gm;
  for (const m of String(text ?? '').matchAll(re)) {
    if (m[1] === 'TASK') {
      if (/\s/.test(m[2])) continue;
      taskIds.push(m[2]);
      events.push({ kind: 'task', value: m[2] });
    } else {
      checkpoints.push(m[2]);
      events.push({ kind: 'checkpoint', value: m[2] });
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
      if (ev.value !== current) outstanding = false;
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

  /** @type {Map<string, { original: string, done: boolean }>} */
  const byTitle = new Map();
  for (const st of plan.steps) {
    const key = st.title.trim();
    const prev = byTitle.get(key);
    byTitle.set(key, { original: prev ? prev.original : st.title, done: (prev ? prev.done : true) && st.status === 'done' });
  }
  const pendingKeys = ts.claimed.filter((c) => byTitle.has(c) && !byTitle.get(c)?.done);
  const allDone = plan.steps.length > 0 && plan.steps.every((st) => st.status === 'done');
  const outstanding = pendingKeys.length > 0 || (allDone && !TERMINAL_STATUSES.includes(plan.status));
  const keptReminded = ts.reminded.filter((r) => pendingKeys.includes(r));

  /** @param {Partial<TaskState>} patch @param {Action} action */
  const out = (patch, action) => ({
    session: { ...session, outstanding, tasks: { ...session.tasks, [id]: { ...ts, reminded: keptReminded, ...patch } } },
    action,
  });

  if (opts.stopHookActive || !REMIND_STATUSES.includes(plan.status)) return out({}, none);

  if (pendingKeys.some((c) => !ts.reminded.includes(c))) {
    return out({ reminded: [...pendingKeys] }, {
      type: 'remindSteps',
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
      'If your send mode is review, show the member the draft and wait for approval first.',
    ].join('\n');
  }
  if (action.type === 'remindComplete') {
    if (action.mode === 'executive') {
      return 'AgentSync: every plan step is done. Finish the task now: call set_task_status with status complete.';
    }
    return 'AgentSync: every plan step is done. Finish the task now: call submit_solution_summary with a summary of the solution, then call set_task_status with status complete.';
  }
  return '';
}
