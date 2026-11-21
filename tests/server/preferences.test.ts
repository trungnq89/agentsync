import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { adoptCookieLocale, setMyLocale, setMyTheme } from '@/server/preferences';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

describe('preferences', () => {
  it('setMyLocale/setMyTheme persist and reject invalid', async () => {
    const u = await makeUser();
    expect(u.locale).toBeNull();
    expect(u.theme).toBe('system');
    await setMyLocale(testDb, u, 'vi');
    await setMyTheme(testDb, u, 'dark');
    const [row] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(row.locale).toBe('vi');
    expect(row.theme).toBe('dark');
    await expect(setMyLocale(testDb, u, 'fr')).rejects.toMatchObject({
      code: 'VALIDATION',
      key: 'invalidPreference',
    });
    await expect(setMyTheme(testDb, u, 'blue')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('adoptCookieLocale', () => {
  it('persists a valid cookie locale when the user has none', async () => {
    const u = await makeUser();
    await adoptCookieLocale(testDb, u, 'vi');
    const [row] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(row.locale).toBe('vi');
  });
  it('never overrides a stored locale, and ignores invalid or missing cookies', async () => {
    const u = await makeUser();
    await setMyLocale(testDb, u, 'en');
    await adoptCookieLocale(testDb, { ...u, locale: 'en' }, 'vi');
    const v = await makeUser();
    await adoptCookieLocale(testDb, v, 'fr');
    await adoptCookieLocale(testDb, v, undefined);
    const [a] = await testDb.select().from(users).where(eq(users.id, u.id));
    const [b] = await testDb.select().from(users).where(eq(users.id, v.id));
    expect(a.locale).toBe('en');
    expect(b.locale).toBeNull();
  });
});
