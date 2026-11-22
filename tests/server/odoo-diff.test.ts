import { describe, expect, it } from 'vitest';
import { computeOdooDiff, mapTitle, type ExistingUser } from '@/server/odoo/diff';
import type { OdooEmployee } from '@/server/odoo/client';

const emp = (id: number, o: Partial<OdooEmployee> = {}): OdooEmployee => ({
  id, name: `E${id}`, email: `e${id}@x.com`, managerId: null, jobTitle: null, active: true, ...o,
});
const usr = (id: string, o: Partial<ExistingUser> = {}): ExistingUser => ({
  id, username: id, email: null, displayName: id, level: 'member', managerId: null,
  isAdmin: false, disabled: false, source: 'local', odooEmployeeId: null, ...o,
});
const maps = [
  { pattern: 'director', level: 'director' as const },
  { pattern: 'lead', level: 'leader' as const },
];
const opts = (mode: 'full' | 'incremental' | 'review' = 'full', titleMappingEnabled = false) => ({ mode, titleMappingEnabled, mappings: maps });
const types = (r: ReturnType<typeof computeOdooDiff>) => r.changes.map((c) => c.type);

describe('odoo diff', () => {
  it('mapTitle first match case-insensitive contains; no match → member; null → member', () => {
    expect(mapTitle('Sr. DIRECTOR of lead', maps)).toBe('director');
    expect(mapTitle('Team Lead', maps)).toBe('leader');
    expect(mapTitle('Dev', maps)).toBe('member');
    expect(mapTitle(null, maps)).toBe('member');
  });

  it('new active employee with email → create with mapped level when enabled, member when disabled', () => {
    const e = [emp(1, { jobTitle: 'Director', email: ' A@X.com ' })];
    const on = computeOdooDiff(e, [], opts('full', true));
    expect(on.changes).toEqual([
      { key: 'create:e1', type: 'create', employeeId: 1, email: 'a@x.com', displayName: 'E1', level: 'director', managerRef: null },
    ]);
    const off = computeOdooDiff(e, [], opts('full', false));
    expect(off.changes[0]).toMatchObject({ level: 'member' });
    expect(computeOdooDiff([emp(2, { active: false })], [], opts()).changes).toEqual([]);
  });

  it('employee without email → skip noEmail', () => {
    const r = computeOdooDiff([emp(1, { email: null })], [], opts());
    expect(r.changes).toEqual([]);
    expect(r.skipped).toEqual([{ employeeId: 1, reason: 'noEmail' }]);
  });

  it('two employees same email → both skip duplicateEmail', () => {
    const r = computeOdooDiff([emp(1, { email: 'a@x.com' }), emp(2, { email: 'A@x.com' })], [], opts());
    expect(r.changes).toEqual([]);
    expect(r.skipped.map((s) => [s.employeeId, s.reason])).toEqual([[1, 'duplicateEmail'], [2, 'duplicateEmail']]);
  });

  it('existing user matched by email → link + updateName/updateManager when different (full)', () => {
    const users = [usr('u1', { email: 'E1@x.com', displayName: 'E1' }), usr('u2', { email: 'e2@x.com', displayName: 'Old' })];
    const r = computeOdooDiff([emp(1), emp(2, { managerId: 1 })], users, opts());
    expect(r.changes.map((c) => c.key)).toEqual(['link:u1', 'link:u2', 'manager:u2', 'name:u2']);
    expect(r.changes.find((c) => c.key === 'manager:u2')).toMatchObject({ from: null, to: { userId: 'u1' } });
    expect(r.changes.find((c) => c.key === 'name:u2')).toMatchObject({ from: 'Old', to: 'E2' });
  });

  it('incremental: existing user manager differs → no updateManager; new employee → create with managerRef', () => {
    const users = [usr('u1', { email: 'e1@x.com', displayName: 'Other' }), usr('u2', { email: 'e2@x.com', managerId: null })];
    const r = computeOdooDiff([emp(1), emp(2, { managerId: 1 }), emp(3, { managerId: 1 })], users, opts('incremental'));
    expect(types(r)).toEqual(['create', 'link', 'link']);
    expect(r.changes[0]).toMatchObject({ key: 'create:e3', managerRef: { userId: 'u1' } });
  });

  it('manager is an employee being created → managerRef {employeeId}', () => {
    const r = computeOdooDiff([emp(1), emp(2, { managerId: 1 })], [], opts());
    expect(r.changes.find((c) => c.key === 'create:e2')).toMatchObject({ managerRef: { employeeId: 1 } });
  });

  it('manager employee has no email → skip managerNoAccount, managerRef null', () => {
    const r = computeOdooDiff([emp(1, { email: null }), emp(2, { managerId: 1 })], [], opts());
    expect(r.changes.find((c) => c.key === 'create:e2')).toMatchObject({ managerRef: null });
    expect(r.skipped).toContainEqual({ employeeId: 2, reason: 'managerNoAccount' });
  });

  it('A→B→A cycle → skip managerCycle for both, no updateManager', () => {
    const users = [usr('a', { email: 'e1@x.com', displayName: 'E1' }), usr('b', { email: 'e2@x.com', displayName: 'E2' })];
    const r = computeOdooDiff([emp(1, { managerId: 2 }), emp(2, { managerId: 1 })], users, opts());
    expect(types(r)).toEqual(['link', 'link']);
    expect(r.skipped.filter((s) => s.reason === 'managerCycle').map((s) => s.userId).sort()).toEqual(['a', 'b']);
    const c = computeOdooDiff([emp(1, { managerId: 2 }), emp(2, { managerId: 1 })], [], opts());
    expect(c.changes.map((x) => [x.type, (x as { managerRef?: unknown }).managerRef])).toEqual([['create', null], ['create', null]]);
    expect(c.skipped.filter((s) => s.reason === 'managerCycle').map((s) => s.employeeId)).toEqual([1, 2]);
  });

  it('inactive employee linked to user → disable (full/review), none in incremental', () => {
    const users = [usr('u1', { source: 'odoo', odooEmployeeId: 1 }), usr('u2', { source: 'odoo', odooEmployeeId: 99 })];
    for (const m of ['full', 'review'] as const) {
      const r = computeOdooDiff([emp(1, { active: false })], users, opts(m));
      expect(r.changes.map((c) => c.key)).toEqual(['disable:u1', 'disable:u2']);
    }
    expect(computeOdooDiff([emp(1, { active: false })], users, opts('incremental')).changes).toEqual([]);
  });

  it('admin user whose employee is inactive → no disable', () => {
    const users = [usr('ad', { isAdmin: true, odooEmployeeId: 1 }), usr('d', { disabled: true, odooEmployeeId: 2 })];
    const r = computeOdooDiff([emp(1, { active: false })], users, opts());
    expect(r.changes).toEqual([]);
  });

  it('local user not in Odoo → untouchedLocal, no changes', () => {
    const r = computeOdooDiff([emp(1)], [usr('loc'), usr('ad', { isAdmin: true })], opts());
    expect(r.untouchedLocal.sort()).toEqual(['ad', 'loc']);
    expect(types(r)).toEqual(['create']);
  });

  it('titleMapping disabled → no updateLevel for existing', () => {
    const users = [usr('u1', { email: 'e1@x.com', displayName: 'E1' })];
    const e = [emp(1, { jobTitle: 'Director' })];
    expect(types(computeOdooDiff(e, users, opts('full', false)))).toEqual(['link']);
    expect(types(computeOdooDiff(e, users, opts('full', true)))).toEqual(['link', 'updateLevel']);
  });

  it('deterministic order and stable keys', () => {
    const users = [
      usr('z', { source: 'odoo', odooEmployeeId: 9 }),
      usr('b', { email: 'e2@x.com', displayName: 'x' }),
      usr('a', { email: 'e1@x.com', displayName: 'x', managerId: 'b' }),
    ];
    const e = [emp(5), emp(2), emp(1, { managerId: 2, jobTitle: 'director' })];
    const r1 = computeOdooDiff(e, users, opts('full', true));
    const r2 = computeOdooDiff([...e].reverse(), [...users].reverse(), opts('full', true));
    expect(r2).toEqual(r1);
    expect(r1.changes.map((c) => c.key)).toEqual([
      'create:e5', 'link:a', 'link:b', 'name:a', 'name:b', 'level:a', 'disable:z',
    ]);
  });

  it('rehire: user linked to archived employee, active employee with same email → relink, no disable', () => {
    const users = [usr('u1', { email: 'new@x.com', source: 'odoo', odooEmployeeId: 1, displayName: 'E2' })];
    const r = computeOdooDiff([emp(1, { active: false, email: 'new@x.com' }), emp(2, { email: 'new@x.com' })], users, opts());
    expect(r.changes).toEqual([{ key: 'link:u1', type: 'link', userId: 'u1', employeeId: 2 }]);
    expect(r.skipped).toEqual([]);
    const gone = computeOdooDiff([emp(2, { email: 'new@x.com' })], users, opts());
    expect(gone.changes.map((c) => c.key)).toEqual(['link:u1']);
  });

  it('active employee email owned by user linked to a different active employee → skip duplicateEmail, no create', () => {
    const users = [usr('u1', { email: 'a@x.com', source: 'odoo', odooEmployeeId: 1, displayName: 'E1' })];
    const r = computeOdooDiff([emp(1, { email: 'other@x.com' }), emp(2, { email: 'a@x.com' })], users, opts());
    expect(r.changes).toEqual([]);
    expect(r.skipped).toEqual([{ employeeId: 2, userId: 'u1', reason: 'duplicateEmail' }]);
  });

  it('inactive manager whose user gets disabled → updateManager null + managerNoAccount', () => {
    const users = [
      usr('m', { source: 'odoo', odooEmployeeId: 1, displayName: 'E1' }),
      usr('w', { source: 'odoo', odooEmployeeId: 2, displayName: 'E2', managerId: 'm' }),
    ];
    const r = computeOdooDiff([emp(1, { active: false }), emp(2, { managerId: 1 }), emp(3, { managerId: 1 })], users, opts());
    expect(r.changes.map((c) => c.key)).toEqual(['create:e3', 'manager:w', 'disable:m']);
    expect(r.changes[0]).toMatchObject({ managerRef: null });
    expect(r.changes[1]).toMatchObject({ from: 'm', to: null });
    expect(r.skipped.map((s) => [s.employeeId, s.reason])).toEqual([[2, 'managerNoAccount'], [3, 'managerNoAccount']]);
  });

  it('parent_id to non-existent employee → managerNoAccount; create gets null', () => {
    const r = computeOdooDiff([emp(1, { managerId: 77 })], [], opts());
    expect(r.changes[0]).toMatchObject({ managerRef: null });
    expect(r.skipped).toEqual([{ employeeId: 1, reason: 'managerNoAccount' }]);
  });

  it('self-manager → skip managerCycle, no manager change', () => {
    const r = computeOdooDiff([emp(1, { managerId: 1 })], [], opts());
    expect(r.changes[0]).toMatchObject({ type: 'create', managerRef: null });
    expect(r.skipped).toEqual([{ employeeId: 1, reason: 'managerCycle' }]);
  });

  it('admin who is also an employee gets updates but never disable', () => {
    const ad = usr('ad', { isAdmin: true, email: 'e1@x.com', managerId: null });
    const r = computeOdooDiff([emp(1, { jobTitle: 'Director' }), emp(2)], [ad, usr('b', { email: 'e2@x.com', displayName: 'E2' })].map((u) => u), opts('full', true));
    expect(r.changes.map((c) => c.key)).toEqual(['link:ad', 'link:b', 'name:ad', 'level:ad']);
    const gone = computeOdooDiff([emp(1, { active: false })], [{ ...ad, odooEmployeeId: 1 }], opts());
    expect(gone.changes).toEqual([]);
  });

  it('review mode yields same changes as full', () => {
    const users = [usr('u1', { email: 'e1@x.com' }), usr('z', { source: 'odoo', odooEmployeeId: 9 })];
    const e = [emp(1, { jobTitle: 'lead' }), emp(2, { managerId: 1 })];
    expect(computeOdooDiff(e, users, opts('review', true))).toEqual(computeOdooDiff(e, users, opts('full', true)));
  });

  it('existing user whose parent_id is empty → updateManager to null', () => {
    const users = [usr('a', { email: 'e1@x.com', displayName: 'E1', managerId: 'b' }), usr('b')];
    const r = computeOdooDiff([emp(1)], users, opts());
    expect(r.changes.map((c) => c.key)).toEqual(['link:a', 'manager:a']);
    expect(r.changes[1]).toMatchObject({ from: 'b', to: null });
  });
});
