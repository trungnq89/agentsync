import { describe, it, expect } from 'vitest';
import {
  parseMarkers,
  turnAssistantTexts,
  applyTurn,
  decide,
  reasonFor,
} from '../../plugins/agentsync/hooks/agentsync-hook.mjs';

const base = () => ({ claimed: [] as string[], reminded: [] as string[], outstanding: false, updatedAt: '2026-01-01T00:00:00.000Z', taskId: 't1' });
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
  it('parseMarkers ignores markers not at line start', () => {
    const r = parseMarkers('see AGENTSYNC-CHECKPOINT: x\nuse AGENTSYNC-TASK: y');
    expect(r).toEqual({ taskIds: [], checkpoints: [] });
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
  it('last task marker wins; switching task resets state', () => {
    const s = { ...base(), claimed: ['A'], reminded: ['A'], completionRemindedAt: 'z', outstanding: true };
    const r = applyTurn(s, { taskIds: ['t2'], checkpoints: ['B'] });
    expect(r.session.taskId).toBe('t2');
    expect(r.session.claimed).toEqual(['B']);
    expect(r.session.reminded).toEqual([]);
    expect(r.session.completionRemindedAt).toBeUndefined();
    expect(r.session.outstanding).toBe(false);
    expect(r.newCheckpoints).toEqual(['B']);
  });
  it('same task keeps state; only unseen checkpoints are new', () => {
    const r = applyTurn({ ...base(), claimed: ['A'] }, { taskIds: ['t1'], checkpoints: ['A', 'B'] });
    expect(r.session.claimed).toEqual(['A', 'B']);
    expect(r.newCheckpoints).toEqual(['B']);
  });
});

describe('decide', () => {
  const p = plan([['A', 'pending'], ['B', 'pending']]);
  it('decide: new checkpoint not done on server → remindSteps with that step; reminded updated; outstanding true', () => {
    const r = decide({ ...base(), claimed: ['A'] }, p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A'] });
    expect(r.session.reminded).toEqual(['A']);
    expect(r.session.outstanding).toBe(true);
  });
  it('decide: placeholder title not in plan → none', () => {
    const r = decide({ ...base(), claimed: ['<step title>'] }, p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(false);
  });
  it('decide: same pending step already reminded and no new one → none', () => {
    const r = decide({ ...base(), claimed: ['A'], reminded: ['A'], outstanding: true }, p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.outstanding).toBe(false);
  });
  it('decide: new checkpoint plus previously reminded pending → remindSteps lists both', () => {
    const r = decide({ ...base(), claimed: ['A', 'B'], reminded: ['A'] }, p, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'remindSteps', steps: ['A', 'B'] });
    expect(r.session.reminded).toEqual(['A', 'B']);
  });
  it('decide: status awaiting_review/paused/done → none', () => {
    for (const status of ['awaiting_review', 'paused', 'done']) {
      const r = decide({ ...base(), claimed: ['A'] }, plan([['A', 'pending']], { status }), { stopHookActive: false });
      expect(r.action).toEqual({ type: 'none' });
    }
  });
  it('decide: allowed statuses pending_confirmation/changes_requested still remind', () => {
    for (const status of ['pending_confirmation', 'changes_requested']) {
      const r = decide({ ...base(), claimed: ['A'] }, plan([['A', 'pending']], { status }), { stopHookActive: false });
      expect(r.action.type).toBe('remindSteps');
    }
  });
  it('decide: stopHookActive → none but claimed kept', () => {
    const r = decide({ ...base(), claimed: ['A'] }, p, { stopHookActive: true });
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session.claimed).toEqual(['A']);
    expect(r.session.reminded).toEqual([]);
  });
  it('decide: plan null → none, session unchanged', () => {
    const s = { ...base(), claimed: ['A'], outstanding: true };
    const r = decide(s, null, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'none' });
    expect(r.session).toEqual(s);
  });
  const done = plan([['A', 'done'], ['B', 'done']]);
  it('decide: all steps done, in_progress, not reminded for this statusChangedAt → remindComplete(project)', () => {
    const r = decide({ ...base(), claimed: ['A', 'B'], reminded: ['A', 'B'] }, done, { stopHookActive: false });
    expect(r.action).toEqual({ type: 'remindComplete', mode: 'project' });
    expect(r.session.completionRemindedAt).toBe(done.statusChangedAt);
    expect(r.session.outstanding).toBe(true);
  });
  it('decide: completion already reminded for same statusChangedAt → none; new statusChangedAt → remindComplete again', () => {
    const s = { ...base(), completionRemindedAt: done.statusChangedAt, outstanding: true };
    expect(decide(s, done, { stopHookActive: false }).action).toEqual({ type: 'none' });
    const later = plan([['A', 'done'], ['B', 'done']], { statusChangedAt: '2026-02-01T00:00:00.000Z' });
    expect(decide(s, later, { stopHookActive: false }).action).toEqual({ type: 'remindComplete', mode: 'project' });
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
    expect(e).toContain('complete');
  });
});
