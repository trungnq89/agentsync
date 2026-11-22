import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { odooSyncRuns, type User } from '@/db/schema';
import { applySync } from '@/server/odoo/sync';

vi.mock('@/server/auth/password', async (orig) => ({
  ...(await orig<typeof import('@/server/auth/password')>()),
  hashPassword: vi.fn(async () => { throw new Error('hash boom'); }),
}));

let admin: User;
beforeEach(async () => { admin = await makeUser({ isAdmin: true }); });

describe('applySync pre-hash failure', () => {
  it('hashPassword throwing → odooApplyFailed and run marked failed', async () => {
    const [run] = await testDb.insert(odooSyncRuns).values({
      mode: 'full', trigger: 'manual', status: 'previewed',
      preview: { changes: [{ key: 'create:e1', type: 'create', employeeId: 1, email: 'a@x.com', displayName: 'A', level: 'member', managerRef: null }], skipped: [], untouchedLocal: [] },
    }).returning();
    await expect(applySync(testDb, admin, run.id)).rejects.toMatchObject({ key: 'odooApplyFailed' });
    const [row] = await testDb.select().from(odooSyncRuns).where(eq(odooSyncRuns.id, run.id));
    expect(row).toMatchObject({ status: 'failed', errorKey: 'odooApplyFailed' });
  });
});
