import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { appSettings, sessions, users } from '@/db/schema';
import { changeMyPassword, listMyTokens, setMySendMode } from '@/server/account';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { login } from '@/server/auth/session';
import { createAgentToken } from '@/server/auth/tokens';
import { listAllUsers } from '@/server/org';
import { getStaleBusinessDays, setStaleBusinessDays } from '@/server/settings';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

describe('account', () => {
  it('listMyTokens returns only own tokens, no hashes, newest first', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await createAgentToken(testDb, a.id, 'first');
    await createAgentToken(testDb, a.id, 'second');
    await createAgentToken(testDb, b.id, 'other');
    const list = await listMyTokens(testDb, a);
    expect(list.map((t) => t.label)).toEqual(['second', 'first']);
    expect(list[0]).not.toHaveProperty('tokenHash');
    expect(list[0].prefix).toMatch(/^ags_/);
  });

  it('setMySendMode updates own mode and rejects invalid values', async () => {
    const a = await makeUser();
    await setMySendMode(testDb, a, 'auto');
    const [row] = await testDb.select().from(users).where(eq(users.id, a.id));
    expect(row.sendMode).toBe('auto');
    await expect(setMySendMode(testDb, a, 'nope' as never)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('changeMyPassword requires the current password and a long enough new one', async () => {
    const a = await makeUser({ passwordHash: await hashPassword('old-password') });
    await expect(changeMyPassword(testDb, a, 'wrong', 'new-password-1')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(changeMyPassword(testDb, a, 'old-password', 'short')).rejects.toMatchObject({ code: 'VALIDATION' });
    await changeMyPassword(testDb, a, 'old-password', 'new-password-1');
    const [row] = await testDb.select().from(users).where(eq(users.id, a.id));
    expect(await verifyPassword(row.passwordHash, 'new-password-1')).toBe(true);
  });
});

describe('password change sessions', () => {
  it('changeMyPassword signs out other sessions but keeps the current one', async () => {
    const a = await makeUser({ passwordHash: await hashPassword('old-password') });
    const s1 = await login(testDb, a.username, 'old-password');
    await login(testDb, a.username, 'old-password');
    await changeMyPassword(testDb, a, 'old-password', 'new-password-1', s1.sessionId);
    const left = await testDb.select().from(sessions).where(eq(sessions.userId, a.id));
    expect(left.map((r) => r.id)).toEqual([s1.sessionId]);
  });
});

describe('admin lists and settings', () => {
  it('listAllUsers is admin-only and includes disabled users', async () => {
    const admin = await makeUser({ isAdmin: true });
    const m = await makeUser({ disabledAt: new Date() });
    await expect(listAllUsers(testDb, m)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const all = await listAllUsers(testDb, admin);
    expect(all.map((u) => u.id)).toContain(m.id);
  });

  it('staleBusinessDays: anyone reads, only admin writes, must be 1..30 integer', async () => {
    const admin = await makeUser({ isAdmin: true });
    const m = await makeUser();
    expect(await getStaleBusinessDays(testDb)).toBe(3);
    await expect(setStaleBusinessDays(testDb, m, 5)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setStaleBusinessDays(testDb, admin, 0)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(setStaleBusinessDays(testDb, admin, 1.5)).rejects.toMatchObject({ code: 'VALIDATION' });
    await setStaleBusinessDays(testDb, admin, 5);
    expect(await getStaleBusinessDays(testDb)).toBe(5);
    const rows = await testDb.select().from(appSettings);
    expect(rows).toHaveLength(1);
  });
});
