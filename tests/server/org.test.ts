import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { sessions, users } from '@/db/schema';
import { hashPassword } from '@/server/auth/password';
import { login } from '@/server/auth/session';
import { verifyPassword } from '@/server/auth/password';
import { createUser, listDirectReports, setPassword, updateUser } from '@/server/org';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

describe('org', () => {
  it('non-admin cannot createUser/updateUser/setPassword', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await expect(
      createUser(testDb, a, { username: 'x', displayName: 'X', password: 'pw', level: 'member' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateUser(testDb, a, b.id, { displayName: 'Y' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setPassword(testDb, a, b.id, 'pw')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admin creates user with hashed password and manager', async () => {
    const admin = await makeUser({ isAdmin: true });
    const m = await makeUser({ level: 'manager' });
    const u = await createUser(testDb, admin, {
      username: 'newbie', displayName: 'Newbie', password: 'secret-pw', level: 'member', managerId: m.id,
    });
    expect(u.managerId).toBe(m.id);
    expect(u.isAdmin).toBe(false);
    expect(u.passwordHash).not.toBe('secret-pw');
    expect(await verifyPassword(u.passwordHash, 'secret-pw')).toBe(true);
  });

  it('setPassword changes hash', async () => {
    const admin = await makeUser({ isAdmin: true });
    const u = await makeUser();
    await setPassword(testDb, admin, u.id, 'new-password-1');
    const [row] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(await verifyPassword(row.passwordHash, 'new-password-1')).toBe(true);
  });

  it('rejects manager cycle and self-manager', async () => {
    const admin = await makeUser({ isAdmin: true });
    const a = await makeUser();
    const b = await makeUser({ managerId: a.id });
    const c = await makeUser({ managerId: b.id });
    await expect(updateUser(testDb, admin, a.id, { managerId: b.id })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateUser(testDb, admin, a.id, { managerId: c.id })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateUser(testDb, admin, a.id, { managerId: a.id })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateUser(testDb, admin, a.id, { managerId: null })).resolves.toBeTruthy();
  });

  it('non-uuid or unknown id is NOT_FOUND', async () => {
    const admin = await makeUser({ isAdmin: true });
    await expect(updateUser(testDb, admin, 'abc', { displayName: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(setPassword(testDb, admin, 'abc', 'pw')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      updateUser(testDb, admin, '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b', { displayName: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a disabled user as new manager, but keeps an existing disabled manager', async () => {
    const admin = await makeUser({ isAdmin: true });
    const gone = await makeUser({ level: 'manager', disabledAt: new Date() });
    const u = await makeUser();
    await expect(updateUser(testDb, admin, u.id, { managerId: gone.id })).rejects.toMatchObject({
      code: 'VALIDATION', key: 'managerDisabled',
    });
    await expect(
      createUser(testDb, admin, { username: 'dm', displayName: 'D', password: 'password-1', level: 'member', managerId: gone.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const kept = await makeUser({ managerId: gone.id });
    const r = await updateUser(testDb, admin, kept.id, { displayName: 'Mới', managerId: gone.id });
    expect(r.managerId).toBe(gone.id);
  });

  it('non-uuid or unknown managerId is VALIDATION', async () => {
    const admin = await makeUser({ isAdmin: true });
    const u = await makeUser();
    await expect(updateUser(testDb, admin, u.id, { managerId: 'abc' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      updateUser(testDb, admin, u.id, { managerId: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('disabled flag sets/clears disabledAt and listDirectReports skips disabled', async () => {
    const admin = await makeUser({ isAdmin: true });
    const m = await makeUser({ level: 'manager' });
    const r1 = await makeUser({ managerId: m.id });
    const r2 = await makeUser({ managerId: m.id });
    await makeUser();
    expect((await listDirectReports(testDb, m.id)).map((u) => u.id).sort()).toEqual([r1.id, r2.id].sort());
    const d = await updateUser(testDb, admin, r2.id, { disabled: true });
    expect(d.disabledAt).toBeInstanceOf(Date);
    expect((await listDirectReports(testDb, m.id)).map((u) => u.id)).toEqual([r1.id]);
    const e = await updateUser(testDb, admin, r2.id, { disabled: false });
    expect(e.disabledAt).toBeNull();
  });

  it('empty-string managerId means no manager (create and update)', async () => {
    const admin = await makeUser({ isAdmin: true });
    const m = await makeUser({ level: 'manager' });
    const u = await createUser(testDb, admin, {
      username: 'nomgr', displayName: 'N', password: 'password-1', level: 'member', managerId: '',
    });
    expect(u.managerId).toBeNull();
    const r = await makeUser({ managerId: m.id });
    const updated = await updateUser(testDb, admin, r.id, { managerId: '' });
    expect(updated.managerId).toBeNull();
  });

  it('duplicate username is VALIDATION', async () => {
    const admin = await makeUser({ isAdmin: true });
    const input = { username: 'dup', displayName: 'D', password: 'password-1', level: 'member' as const };
    await createUser(testDb, admin, input);
    await expect(createUser(testDb, admin, input)).rejects.toMatchObject({
      code: 'VALIDATION',
      key: 'usernameTaken',
    });
  });

  it('validates password length, level and displayName', async () => {
    const admin = await makeUser({ isAdmin: true });
    const base = { username: 'v1', displayName: 'V', password: 'long-enough-pw', level: 'member' as const };
    await expect(createUser(testDb, admin, { ...base, password: 'short' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createUser(testDb, admin, { ...base, level: 'boss' as never })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createUser(testDb, admin, { ...base, displayName: '   ' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const u = await createUser(testDb, admin, base);
    await expect(updateUser(testDb, admin, u.id, { level: 'boss' as never })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateUser(testDb, admin, u.id, { displayName: ' ' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(setPassword(testDb, admin, u.id, 'short')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('setPassword signs the user out everywhere', async () => {
    const admin = await makeUser({ isAdmin: true });
    const u = await makeUser({ passwordHash: await hashPassword('old-password') });
    await login(testDb, u.username, 'old-password');
    await login(testDb, u.username, 'old-password');
    await setPassword(testDb, admin, u.id, 'new-password-1');
    expect(await testDb.select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
  });

  it('cannot demote or disable the last active admin', async () => {
    const admin = await makeUser({ isAdmin: true });
    await expect(updateUser(testDb, admin, admin.id, { isAdmin: false })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateUser(testDb, admin, admin.id, { disabled: true })).rejects.toMatchObject({ code: 'VALIDATION' });
    const other = await makeUser({ isAdmin: true });
    await updateUser(testDb, admin, other.id, { isAdmin: false });
    await expect(updateUser(testDb, admin, admin.id, { isAdmin: false })).rejects.toMatchObject({ code: 'VALIDATION' });
    await updateUser(testDb, admin, other.id, { isAdmin: true });
    await updateUser(testDb, admin, admin.id, { isAdmin: false });
  });
});
