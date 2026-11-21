import { describe, it, expect } from 'vitest';
import { createAgentToken, revokeAgentToken } from '@/server/auth/tokens';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
const { POST } = await import('../../app/api/mcp/[transport]/route');

const rpc = (headers: Record<string, string>) =>
  new Request('http://localhost/api/mcp/mcp', {
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

  it('valid token lists tools', async () => {
    const u = await makeUser();
    const { token } = await createAgentToken(testDb, u.id, 'x');
    const res = await POST(rpc({ authorization: `Bearer ${token}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toContain('create_task');
  });
});
