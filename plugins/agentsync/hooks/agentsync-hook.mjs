// AgentSync checkpoint Stop hook. Zero dependencies (node: built-ins only), Node >= 20.
// This part: pure decision logic. IO/main lives elsewhere.

/**
 * @typedef {{ taskId?: string, claimed: string[], reminded: string[], completionRemindedAt?: string, outstanding: boolean, updatedAt: string }} Session
 * @typedef {{ id: string, status: string, mode: string, statusChangedAt: string, steps: { title: string, status: string }[] }} Plan
 * @typedef {{ type: 'none' } | { type: 'remindSteps', steps: string[] } | { type: 'remindComplete', mode: 'project' | 'executive' }} Action
 */

const REMIND_STATUSES = ['pending_confirmation', 'in_progress', 'changes_requested'];

/**
 * @param {string} text
 * @returns {{ taskIds: string[], checkpoints: string[] }}
 */
export function parseMarkers(text) {
  const taskIds = [];
  const checkpoints = [];
  for (const m of String(text ?? '').matchAll(/^[ \t]*AGENTSYNC-TASK:[ \t]*(\S+)[ \t]*\r?$/gm)) taskIds.push(m[1]);
  for (const m of String(text ?? '').matchAll(/^[ \t]*AGENTSYNC-CHECKPOINT:[ \t]*(.+?)[ \t]*\r?$/gm)) checkpoints.push(m[1]);
  return { taskIds, checkpoints };
}

/**
 * Assistant text blocks since the most recent real user message of a Claude Code JSONL transcript.
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
    const msg = obj && typeof obj === 'object' ? obj.message : null;
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
 * @param {Session} session
 * @param {{ taskIds: string[], checkpoints: string[] }} markers
 * @returns {{ session: Session, newCheckpoints: string[] }}
 */
export function applyTurn(session, markers) {
  let s = { ...session };
  const last = markers.taskIds.length ? markers.taskIds[markers.taskIds.length - 1] : undefined;
  if (last && last !== s.taskId) {
    s = { ...s, taskId: last, claimed: [], reminded: [], completionRemindedAt: undefined, outstanding: false };
  }
  const claimed = [...s.claimed];
  const newCheckpoints = [];
  for (const c of markers.checkpoints) {
    const t = c.trim();
    if (t && !claimed.includes(t)) {
      claimed.push(t);
      newCheckpoints.push(t);
    }
  }
  return { session: { ...s, claimed }, newCheckpoints };
}

/**
 * @param {Session} session
 * @param {Plan | null} plan
 * @param {{ stopHookActive: boolean }} opts
 * @returns {{ session: Session, action: Action }}
 */
export function decide(session, plan, opts) {
  if (plan === null || opts.stopHookActive) return { session, action: { type: 'none' } };
  const none = () => ({ session: { ...session, outstanding: false }, action: /** @type {Action} */ ({ type: 'none' }) });
  const status = plan.status;
  if (!REMIND_STATUSES.includes(status)) return none();

  const done = new Map(plan.steps.map((st) => [st.title.trim(), st.status === 'done']));
  const pending = session.claimed.filter((c) => done.has(c.trim()) && !done.get(c.trim()));
  if (pending.some((c) => !session.reminded.includes(c))) {
    const reminded = [...session.reminded];
    for (const c of pending) if (!reminded.includes(c)) reminded.push(c);
    return { session: { ...session, reminded, outstanding: true }, action: { type: 'remindSteps', steps: pending } };
  }
  if (
    pending.length === 0 &&
    status === 'in_progress' &&
    plan.steps.length > 0 &&
    plan.steps.every((st) => st.status === 'done') &&
    session.completionRemindedAt !== plan.statusChangedAt
  ) {
    return {
      session: { ...session, completionRemindedAt: plan.statusChangedAt, outstanding: true },
      action: { type: 'remindComplete', mode: plan.mode === 'executive' ? 'executive' : 'project' },
    };
  }
  return none();
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
