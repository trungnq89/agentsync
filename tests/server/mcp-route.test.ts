import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { agentTokens, users } from '@/db/schema';
import { createAgentToken, revokeAgentToken } from '@/server/auth/tokens';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
const { POST, GET, DELETE } = await import('../../app/api/mcp/route');

const rpc = (headers: Record<string, string>) =>
  new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });

describe('mcp route', () => {
  it('401 without header or with a wrong token', async () => {
    for (const h of ([{}, { authorization: 'Bearer ags_nope' }, { authorization: 'Basic abc' }] as Record<string, string>[])) {
      const res = await POST(rpc(h));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('401 for revoked token', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'x');
    await revokeAgentToken(testDb, u.id, record.id);
    expect((await POST(rpc({ authorization: `Bearer ${token}` }))).status).toBe(401);
  });

  it('401 for a disabled user', async () => {
    const u = await makeUser();
    const { token } = await createAgentToken(testDb, u.id, 'x');
    await testDb.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.id));
    expect((await POST(rpc({ authorization: `Bearer ${token}` }))).status).toBe(401);
  });

  it('401 for an expired token (expiresAt == now)', async () => {
    const u = await makeUser();
    const { token, record } = await createAgentToken(testDb, u.id, 'x');
    await testDb.update(agentTokens).set({ expiresAt: new Date() }).where(eq(agentTokens.id, record.id));
    expect((await POST(rpc({ authorization: `Bearer ${token}` }))).status).toBe(401);
  });

  it('GET and DELETE are 405', async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });

  it('valid token lists tools', async () => {
    const u = await makeUser();
    const { token } = await createAgentToken(testDb, u.id, 'x');
    const res = await POST(rpc({ authorization: `Bearer ${token}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toContain('create_task');
  });
});
