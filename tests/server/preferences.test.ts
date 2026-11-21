import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { setMyLocale, setMyTheme } from '@/server/preferences';
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
