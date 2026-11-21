import { describe, it, expect } from 'vitest';
import { canViewTask, canViewUser, isCurrentManagerOf, loadTaskForViewer } from '@/server/authz';
import { isUuid } from '@/server/ids';
import { updateUser } from '@/server/org';
import { revokeAgentToken } from '@/server/auth/tokens';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

describe('authz', () => {
  it('isUuid', () => {
    expect(isUuid('3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b')).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('direct manager sees report task; grand-manager does not', async () => {
    const director = await makeUser({ level: 'director' });
    const manager = await makeUser({ level: 'manager', managerId: director.id });
    const leader = await makeUser({ level: 'leader', managerId: manager.id });
    const t = await makeTask(leader.id);
    await expect(loadTaskForViewer(testDb, manager, t.id)).resolves.toMatchObject({ task: { id: t.id } });
    await expect(loadTaskForViewer(testDb, director, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(loadTaskForViewer(testDb, leader, t.id)).resolves.toBeTruthy();
    expect(canViewUser(manager, leader)).toBe(true);
    expect(canViewUser(director, leader)).toBe(false);
    expect(isCurrentManagerOf(manager, leader)).toBe(true);
    expect(isCurrentManagerOf(director, leader)).toBe(false);
  });

  it('nobody but owner sees private task, including manager and admin', async () => {
    const admin = await makeUser({ isAdmin: true });
    const manager = await makeUser({ level: 'manager' });
    const owner = await makeUser({ managerId: manager.id });
    const t = await makeTask(owner.id, { isPrivate: true });
    await expect(loadTaskForViewer(testDb, owner, t.id)).resolves.toBeTruthy();
    await expect(loadTaskForViewer(testDb, manager, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(loadTaskForViewer(testDb, admin, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(canViewTask(manager, t, owner)).toBe(false);
  });

  it('admin without management link cannot view task', async () => {
    const admin = await makeUser({ isAdmin: true });
    const owner = await makeUser();
    const t = await makeTask(owner.id);
    await expect(loadTaskForViewer(testDb, admin, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('after manager change, old manager gets NOT_FOUND and new manager sees it', async () => {
    const admin = await makeUser({ isAdmin: true });
    const m1 = await makeUser({ level: 'manager' });
    const m2 = await makeUser({ level: 'manager' });
    const leader = await makeUser({ level: 'leader', managerId: m1.id });
    const t = await makeTask(leader.id);
    await updateUser(testDb, admin, leader.id, { managerId: m2.id });
    await expect(loadTaskForViewer(testDb, m1, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(loadTaskForViewer(testDb, m2, t.id)).resolves.toBeTruthy();
  });

  it('missing or non-uuid task id is NOT_FOUND', async () => {
    const u = await makeUser();
    await expect(loadTaskForViewer(testDb, u, '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(loadTaskForViewer(testDb, u, 'abc')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('revokeAgentToken with non-uuid id is NOT_FOUND', async () => {
    const u = await makeUser();
    await expect(revokeAgentToken(testDb, u.id, 'abc')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
