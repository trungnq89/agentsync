import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { agentTokens } from '@/db/schema';
import { createAgentToken, revokeAgentToken } from '@/server/auth/tokens';
import { testDb } from '../helpers/db';
import { makeTask, makeUser } from '../helpers/factories';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
const { GET } = await import('../../app/api/agent/tasks/[id]/plan/route');

const call = (id: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/agent/tasks/${id}/plan`, { headers }), { params: Promise.resolve({ id }) });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('agent plan route', () => {
  it('401 for an expired token', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'x');
    await testDb.update(agentTokens).set({ expiresAt: new Date() }).where(eq(agentTokens.id, record.id));
    const t = await makeTask(u.id);
    expect((await call(t.id, bearer(token))).status).toBe(401);
  });

  it('owner gets plan with exact keys', async () => {
    const u = await makeUser();
    const { token } = await createAgentToken(testDb, u.id, 'x');
    const t = await makeTask(u.id, { status: 'in_progress', steps: ['Step A', 'Step B'] });
    const res = await call(t.id, bearer(token));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['id', 'status', 'mode', 'statusChangedAt', 'effectiveConfirmer', 'steps']);
    expect(body.id).toBe(t.id);
    expect(body.status).toBe('in_progress');
    expect(typeof body.statusChangedAt).toBe('string');
    expect(Object.keys(body.steps[0])).toEqual(['title', 'status']);
    expect(body.steps[0]).toEqual({ title: 'Step A', status: 'todo' });
  });

  it('manager of owner gets 404', async () => {
    const manager = await makeUser({ level: 'manager' });
    const owner = await makeUser({ managerId: manager.id });
    const { token } = await createAgentToken(testDb, manager.id, 'x');
    const t = await makeTask(owner.id);
    const res = await call(t.id, bearer(token));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('private task of other user 404', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const { token } = await createAgentToken(testDb, other.id, 'x');
    const t = await makeTask(owner.id, { isPrivate: true });
    expect((await call(t.id, bearer(token))).status).toBe(404);
  });

  it('non-uuid id 404', async () => {
    const u = await makeUser();
    const { token } = await createAgentToken(testDb, u.id, 'x');
    expect((await call('not-a-uuid', bearer(token))).status).toBe(404);
  });

  it('bad token 401', async () => {
    for (const h of [{}, { authorization: 'Bearer ags_nope' }] as Record<string, string>[]) {
      const res = await call('00000000-0000-4000-8000-000000000000', h);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('revoked token 401', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'x');
    await revokeAgentToken(testDb, u.id, record.id);
    const t = await makeTask(u.id);
    expect((await call(t.id, bearer(token))).status).toBe(401);
  });
});
