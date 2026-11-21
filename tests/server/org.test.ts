import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
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
    await setPassword(testDb, admin, u.id, 'new-pw');
    const [row] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(await verifyPassword(row.passwordHash, 'new-pw')).toBe(true);
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
});
