import { describe, it, expect } from 'vitest';
import {
  nextStatus, initialStatus, ACTIVE_STATUSES, DONE_STATUSES, TERMINAL_STATUSES,
  type TaskAction, type Role,
} from '@/server/tasks/lifecycle';
import type { TaskStatus } from '@/server/tasks/lifecycle';

const base = { mode: 'project' as const, hasManager: true, isPrivate: false };

describe('nextStatus table', () => {
  it.each<[TaskStatus, TaskAction, Role, TaskStatus]>([
    ['pending_confirmation', 'confirm', 'manager', 'in_progress'],
    ['pending_confirmation', 'request_changes', 'manager', 'changes_requested'],
    ['changes_requested', 'resubmit', 'owner', 'pending_confirmation'],
    ['in_progress', 'complete', 'owner', 'awaiting_review'],
    ['awaiting_review', 'approve_review', 'manager', 'closed'],
    ['awaiting_review', 'reject_review', 'manager', 'in_progress'],
    ['in_progress', 'pause', 'owner', 'paused'],
    ['paused', 'resume', 'owner', 'in_progress'],
    ['pending_confirmation', 'cancel', 'owner', 'cancelled'],
    ['changes_requested', 'cancel', 'owner', 'cancelled'],
    ['in_progress', 'cancel', 'owner', 'cancelled'],
    ['paused', 'cancel', 'owner', 'cancelled'],
    ['awaiting_review', 'cancel', 'owner', 'cancelled'],
  ])('%s --%s(%s)--> %s', (from, action, role, to) => {
    expect(nextStatus({ ...base, status: from }, action, role)).toBe(to);
  });

  it.each([
    [{ mode: 'executive' as const, hasManager: true, isPrivate: false }],
    [{ mode: 'project' as const, hasManager: false, isPrivate: false }],
    [{ mode: 'project' as const, hasManager: true, isPrivate: true }],
  ])('complete goes straight to done: %j', (ctx) => {
    expect(nextStatus({ ...ctx, status: 'in_progress' }, 'complete', 'owner')).toBe('done');
  });

  it('complete in project mode with manager -> awaiting_review', () => {
    expect(nextStatus({ ...base, status: 'in_progress' }, 'complete', 'owner')).toBe('awaiting_review');
  });

  it('confirm by owner -> FORBIDDEN', () => {
    expect(() => nextStatus({ ...base, status: 'pending_confirmation' }, 'confirm', 'owner'))
      .toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('pause from done -> INVALID_TRANSITION', () => {
    expect(() => nextStatus({ ...base, status: 'done' }, 'pause', 'owner'))
      .toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('cancel from closed -> INVALID_TRANSITION', () => {
    expect(() => nextStatus({ ...base, status: 'closed' }, 'cancel', 'owner'))
      .toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });
});

describe('initialStatus', () => {
  it.each([
    [{ hasManager: true, isPrivate: false }, 'pending_confirmation'],
    [{ hasManager: true, isPrivate: true }, 'in_progress'],
    [{ hasManager: false, isPrivate: false }, 'in_progress'],
  ])('%j -> %s', (ctx, expected) => {
    expect(initialStatus(ctx)).toBe(expected);
  });
});

describe('status groups', () => {
  it('has expected sets', () => {
    expect([...ACTIVE_STATUSES]).toEqual(['pending_confirmation', 'changes_requested', 'in_progress', 'paused', 'awaiting_review']);
    expect([...DONE_STATUSES]).toEqual(['done', 'closed']);
    expect([...TERMINAL_STATUSES]).toEqual(['done', 'closed', 'cancelled']);
  });
});
