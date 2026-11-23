import { describe, it, expect } from 'vitest';
import {
  parseMarkers,
  turnAssistantTexts,
  applyTurn,
  decide,
  reasonFor,
} from '../../plugins/agentsync/hooks/agentsync-hook.mjs';

type Session = Parameters<typeof decide>[0];
type TS = { claimed: string[]; reminded: string[]; completionRemindedAt?: string };
const base = (ts: Partial<TS> = {}, outstanding = false): Session => ({
  currentTaskId: 't1',
  tasks: { t1: { claimed: [], reminded: [], ...ts } as TS } as Record<string, TS>,
  outstanding,
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const t1 = (r: { session: Session }) => r.session.tasks.t1;
const plan = (steps: [string, string][], over: Record<string, unknown> = {}) => ({
  id: 't1', status: 'in_progress', mode: 'project', statusChangedAt: '2026-01-01T00:00:00.000Z',
  steps: steps.map(([title, status]) => ({ title, status })), ...over,
});

describe('parseMarkers', () => {
  it('parseMarkers finds multiple checkpoints and trims', () => {
    const r = parseMarkers('hi\nAGENTSYNC-TASK: abc-1 \n  AGENTSYNC-CHECKPOINT:   Step A  \nx\nAGENTSYNC-CHECKPOINT: Step B\n');
    expect(r.taskIds).toEqual(['abc-1']);
    expect(r.checkpoints).toEqual(['Step A', 'Step B']);
  });
  it.each([
    ['backticks', '`AGENTSYNC-CHECKPOINT: Step A`'],
    ['dash bullet', '- AGENTSYNC-CHECKPOINT: Step A'],
    ['star bullet', '* AGENTSYNC-CHECKPOINT: Step A'],
    ['quote', '> AGENTSYNC-CHECKPOINT: Step A'],
    ['bold', '**AGENTSYNC-CHECKPOINT: Step A**'],
    ['bold label', '**AGENTSYNC-CHECKPOINT:** Step A'],
    ['bullet + backticks', '- `AGENTSYNC-CHECKPOINT: Step A`'],
  ])('parseMarkers tolerates %s', (_n, line) => {
    expect(parseMarkers(line).checkpoints).toEqual(['Step A']);
  });
  it('parseMarkers tolerates wrappers on the task marker', () => {
    expect(parseMarkers('- **AGENTSYNC-TASK: abc-1**').taskIds).toEqual(['abc-1']);
    expect(parseMarkers('`AGENTSYNC-TASK: abc-1`').taskIds).toEqual(['abc-1']);
  });
  it('parseMarkers ignores markers not at line start', () => {
    const r = parseMarkers('see AGENTSYNC-CHECKPOINT: x\nuse AGENTSYNC-TASK: y');
    expect(r).toEqual({ taskIds: [], checkpoints: [], events: [] });
  });
});

describe('turnAssistantTexts', () => {
  it('turnAssistantTexts returns assistant texts after last real user message, skipping tool_result-only user lines', () => {
    const lines = [
      { type: 'user', message: { role: 'user', content: 'old request' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'OLD' }] } },
      { type: 'summary', summary: 'unknown line type' },
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'new request' }] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'first' }, { type: 'tool_use', id: 'x', name: 'Bash', input: {} }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] } },
    ].map((l) => JSON.stringify(l));
    lines.splice(3, 0, '{not json');
    expect(turnAssistantTexts(lines.join('\n') + '\n')).toEqual(['first', 'second']);
  });
});

describe('applyTurn', () => {
  it('switching task keeps per-task state; last task marker wins', () => {
    let s = base({ claimed: ['A'], reminded: ['A'] }, true);
    s = applyTurn(s, parseMarkers('AGENTSYNC-TASK: t2\nAGENTSYNC-CHECKPOINT: B')).session;
    expect(s.currentTaskId).toBe('t2');
    expect(s.outstanding).toBe(true); // newly linked task is checked once
    expect(s.tasks.t2.claimed).toEqual(['B']);
    s = applyTurn(s, parseMarkers('AGENTSYNC-TASK: t1')).session;
    expect(s.currentTaskId).toBe('t1');
    expect(s.tasks.t1).toEqual({ claimed: ['A'], reminded: ['A'] });
  });
  it('checkpoints attach to the most recent preceding task marker, in textual order', () => {
    const r = applyTurn(
      base(),
      parseMarkers('AGENTSYNC-CHECKPOINT: X\nAGENTSYNC-TASK: t2\nAGENTSYNC-CHECKPOINT: Y\nAGENTSYNC-TASK: t1\nAGENTSYNC-CHECKPOINT: Z'),
    );
    expect(r.session.tasks.t1.claimed).toEqual(['X', 'Z']);
    expect(r.session.tasks.t2.claimed).toEqual(['Y']);
    expect(r.newCheckpoints).toEqual(['X', 'Z']);
  });
  it('checkpoint with no task at all is ignored', () => {
    const r = applyTurn({ tasks: {}, outstanding: false, updatedAt: 'x' }, parseMarkers('AGENTSYNC-CHECKPOINT: X'));
    expect(r.session.tasks).toEqual({});
    expect(r.newCheckpoints).toEqual([]);
  });
  it('same task keeps state; only unseen checkpoints are new', () => {
    const r = applyTurn(base({ claimed: ['A'] }), parseMarkers('AGENTSYNC-TASK: t1\nAGENTSYNC-CHECKPOINT: A\nAGENTSYNC-CHECKPOINT: B'));
    expect(t1(r).claimed).toEqual(['A', 'B']);
    expect(r.newCheckpoints).toEqual(['B']);
  });
});

describe('decide', () => {
  it('decide skips steps with non-string titles without throwing', () => {
    const bad = plan([['A', 'pending']]);
    (bad.steps as unknown[]).push({ title: 5, status: 'done' }, null);
    const r = decide(base({ claimed: ['A'] }), bad as never, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A'] });
  });
  const p = plan([['A', 'pending'], ['B', 'pending']]);
  it('decide: new checkpoint not done on server → remindSteps with that step; reminded updated; outstanding true', () => {
    const r = decide(base({ claimed: ['A'] }), p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A'] });
    expect(t1(r).reminded).toEqual(['A']);
    expect(r.session.outstanding).toBe(true);
  });
  it('decide: placeholder title not in plan → none', () => {
    const r = decide(base({ claimed: ['<step title>'] }), p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(false);
  });
  it('decide: same pending step already reminded and no new one → none', () => {
    const r = decide(base({ claimed: ['A'], reminded: ['A'] }, true), p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(true);
  });
  it('decide: new checkpoint plus previously reminded pending → remindSteps lists both', () => {
    const r = decide(base({ claimed: ['A', 'B'], reminded: ['A'] }), p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A', 'B'] });
    expect(t1(r).reminded).toEqual(['A', 'B']);
  });
  it('decide: status awaiting_review/paused/done → none', () => {
    for (const status of ['awaiting_review', 'paused', 'done']) {
      const r = decide(base({ claimed: ['A'] }), plan([['A', 'pending']], { status }), { stopHookActive: false });
      expect(r.action).toEqual({ type: 'none' });
    }
  });
  it('decide: allowed statuses pending_confirmation/changes_requested still remind', () => {
    for (const status of ['pending_confirmation', 'changes_requested']) {
      const r = decide(base({ claimed: ['A'] }), plan([['A', 'pending']], { status }), { stopHookActive: false });
      expect(r.action.type).toBe('remindSteps');
    }
  });
  it('decide: stopHookActive → none but claimed kept', () => {
    const r = decide(base({ claimed: ['A'] }, true), p, { stopHookActive: true });
    expect(r.action).toEqual({ type: 'none' });
    expect(t1(r).claimed).toEqual(['A']);
    expect(t1(r).reminded).toEqual([]);
    expect(r.session.outstanding).toBe(true);
  });
  it('decide: plan null → none, session unchanged', () => {
    const s = base({ claimed: ['A'] }, true);
    const r = decide(s, null, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session).toEqual(s);
  });
  const done = plan([['A', 'done'], ['B', 'done']]);
  it('decide: all steps done, in_progress, not reminded for this statusChangedAt → remindComplete(project)', () => {
    const r = decide(base({ claimed: ['A', 'B'], reminded: ['A', 'B'] }), done, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'remindComplete', mode: 'project' });
    expect(t1(r).completionRemindedAt).toBe(done.statusChangedAt);
    expect(r.session.outstanding).toBe(true);
  });
  it('decide: completion already reminded for same statusChangedAt → none; new statusChangedAt → remindComplete again', () => {
    const s = base({ completionRemindedAt: done.statusChangedAt }, true);
    expect(decide(s, done, { stopHookActive: false }).action).toEqual({ type: 'none' });
    const later = plan([['A', 'done'], ['B', 'done']], { statusChangedAt: '2026-02-01T00:00:00.000Z' });
    expect(decide(s, later, { stopHookActive: false }).action).toEqual({ type: 'remindComplete', mode: 'project' });
  });
});

describe('decide: multi-turn and edge cases', () => {
  const T0 = '2026-01-01T00:00:00.000Z';
  const T1 = '2026-02-01T00:00:00.000Z';
  const run = (s: Session, p: ReturnType<typeof plan> | null, hook = false) => decide(s, p, { stopHookActive: hook });

  it('(a) complete -> awaiting_review keeps outstanding -> rejected with new statusChangedAt reminds again', () => {
    let r = run(base({ claimed: ['A'], reminded: ['A'] }), plan([['A', 'done']], { statusChangedAt: T0 }));
    expect(r.action.type).toBe('remindComplete');
    r = run(r.session, plan([['A', 'done']], { status: 'awaiting_review', statusChangedAt: T0 }));
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(true);
    r = run(r.session, plan([['A', 'done']], { status: 'in_progress', statusChangedAt: T1 }));
    expect(r.action).toEqual({ type: 'remindComplete', mode: 'project' });
  });
  it('(b) last step reminded but draft pending -> none, outstanding; step later done -> remindComplete', () => {
    let r = run(base({ claimed: ['A'] }), plan([['A', 'pending']]));
    expect(r.action.type).toBe('remindSteps');
    r = run(r.session, plan([['A', 'pending']]));
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(true);
    r = run(r.session, plan([['A', 'done']]));
    expect(r.action.type).toBe('remindComplete');
  });
  it('outstanding stays true for non-allowed status while work remains, false when terminal', () => {
    expect(run(base({ claimed: ['A'] }), plan([['A', 'pending']], { status: 'paused' })).session.outstanding).toBe(true);
    expect(run(base({ claimed: ['A'] }, true), plan([['A', 'done']], { status: 'done' })).session.outstanding).toBe(false);
    expect(run(base({ claimed: ['A'] }, true), plan([['A', 'done']], { status: 'closed' })).session.outstanding).toBe(false);
  });
  it('stopHookActive refreshes outstanding from the plan without blocking', () => {
    const r = run(base({ claimed: ['A'] }, true), plan([['A', 'done'], ['B', 'pending']]), true);
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(false);
    expect(run(base({ claimed: ['A'] }), plan([['A', 'pending']]), true).session.outstanding).toBe(true);
  });
  it('executive mode gives remindComplete(executive)', () => {
    const r = run(base({ claimed: ['A'], reminded: ['A'] }), plan([['A', 'done']], { mode: 'executive' }));
    expect(r.action).toEqual({ type: 'remindComplete', mode: 'executive' });
  });
  it('empty-step plan never reminds completion', () => {
    const r = run(base(), plan([]));
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(false);
  });
  it('matches trimmed titles but lists the server original title', () => {
    const r = run(base({ claimed: ['Write API'] }), plan([['  Write API ', 'pending']]));
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['  Write API '] });
  });
  it('duplicate plan titles count as done only if all are done', () => {
    expect(run(base({ claimed: ['A'] }), plan([['A', 'done'], ['A', 'pending']])).action.type).toBe('remindSteps');
    const r = run(base({ claimed: ['A'], reminded: ['A'] }), plan([['A', 'done'], ['A', 'done']]));
    expect(r.action.type).toBe('remindComplete');
  });
});

describe('turnAssistantTexts: meta and sidechain', () => {
  it('ignores isMeta user lines and isSidechain lines', () => {
    const L = (o: object) => JSON.stringify(o);
    const t = [
      L({ type: 'user', message: { role: 'user', content: 'real' } }),
      L({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'keep1' }] } }),
      L({ type: 'user', isMeta: true, message: { role: 'user', content: 'meta caveat' } }),
      L({ type: 'user', isSidechain: true, message: { role: 'user', content: 'sub prompt' } }),
      L({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'SUB' }] } }),
      L({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'keep2' }] } }),
    ].join('\n');
    expect(turnAssistantTexts(t)).toEqual(['keep1', 'keep2']);
  });
});

describe('reasonFor', () => {
  it('reasonFor remindSteps mentions update_progress, stepsCompleted, exact titles, review draft', () => {
    const t = reasonFor({ type: 'remindSteps', steps: ['Write the API', 'Add "tests"'] });
    expect(t).toContain('update_progress');
    expect(t).toContain('stepsCompleted');
    expect(t).toContain('Write the API');
    expect(t).toContain('Add "tests"');
    expect(t).toContain('If your send mode is review, show the member the draft and wait for approval first.');
  });
  it('reasonFor remindComplete differs by mode', () => {
    const p = reasonFor({ type: 'remindComplete', mode: 'project' });
    expect(p).toContain('submit_solution_summary');
    expect(p).toContain('set_task_status');
    expect(p.indexOf('submit_solution_summary')).toBeLessThan(p.indexOf('set_task_status'));
    const e = reasonFor({ type: 'remindComplete', mode: 'executive' });
    expect(e).not.toContain('submit_solution_summary');
    expect(e).toContain('set_task_status');
    expect(e).toContain('action "complete"');
    expect(e).not.toContain('status complete');
    expect(p).toContain('action "complete"');
    for (const t of [p, e]) expect(t).toContain('If your send mode is review, show the member the draft and wait for approval first.');
  });
});

describe('decide with pending_approval', () => {
  const go = (sess: Session, pl: ReturnType<typeof plan>) => decide(sess, pl as never, { stopHookActive: false });
  it('pending_approval step counts as reported: no remindSteps, reminded entry dropped', () => {
    const r = go(base({ claimed: ['A'], reminded: ['A'] }, true), plan([['A', 'pending_approval'], ['B', 'todo']]));
    expect(r.action).toEqual({ type: 'none' });
    expect(t1(r).reminded).toEqual([]);
    expect(r.session.outstanding).toBe(false);
  });
  it('first sight of a pending_approval claim does not remind', () => {
    const r = go(base({ claimed: ['A'] }), plan([['A', 'pending_approval']]));
    expect(r.action).toEqual({ type: 'none' });
  });
  it('all steps pending_approval: no completion reminder', () => {
    const r = go(base({ claimed: ['A', 'B'] }), plan([['A', 'pending_approval'], ['B', 'pending_approval']]));
    expect(r.action).toEqual({ type: 'none' });
  });
  it('mix of done and pending_approval: no completion reminder; all done: completion reminder', () => {
    expect(go(base({ claimed: ['A', 'B'] }), plan([['A', 'done'], ['B', 'pending_approval']])).action).toEqual({ type: 'none' });
    expect(go(base({ claimed: ['A', 'B'] }), plan([['A', 'done'], ['B', 'done']])).action).toMatchObject({ type: 'remindComplete' });
  });
  it('rejected step is not reminded on a later poll, only after its marker is re-printed', () => {
    let r = go(base({ claimed: ['A'] }), plan([['A', 'doing']]));
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A'] });
    r = go(r.session, plan([['A', 'pending_approval']]));
    expect(r.action).toEqual({ type: 'none' });
    expect(t1(r).claimed).toEqual([]);
    expect(t1(r).reminded).toEqual([]);
    // manager rejected A (doing); another claim keeps the hook polling, A is not nagged
    const s = applyTurn(r.session, parseMarkers('AGENTSYNC-CHECKPOINT: B')).session;
    r = go(s, plan([['A', 'doing'], ['B', 'doing']]));
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['B'] });
    // agent re-prints A's marker -> claimed again -> reminded as new
    const re = applyTurn(r.session, parseMarkers('AGENTSYNC-CHECKPOINT: A'));
    expect(re.newCheckpoints).toEqual(['A']);
    r = go(re.session, plan([['A', 'doing'], ['B', 'pending_approval']]));
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A'] });
  });
  it('leftover pending_approval when the member is the effective confirmer is treated as unreported', () => {
    const r = go(base({ claimed: ['A'] }), plan([['A', 'pending_approval']], { effectiveConfirmer: 'member' }));
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A'] });
    expect(t1(r).claimed).toEqual(['A']);
    expect(go(base({ claimed: ['A'] }), plan([['A', 'pending_approval']], { effectiveConfirmer: 'manager' })).action).toEqual({ type: 'none' });
  });
});
