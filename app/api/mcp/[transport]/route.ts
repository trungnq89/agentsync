import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { getDb } from '@/db';
import { registerTools } from '@/mcp/tools';
import { authenticateAgentToken } from '@/server/auth/tokens';
import { DomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 });

async function handle(req: Request): Promise<Response> {
  const db = getDb();
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return unauthorized();
  let user;
  try {
    user = await authenticateAgentToken(db, m[1]);
  } catch (e) {
    if (e instanceof DomainError) return unauthorized();
    console.error('[mcp] auth failed', e);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
  // Stateless: a fresh server + transport per request.
  const server = new McpServer({ name: 'agentsync', version: '0.1.0' });
  registerTools(server, { db, getActor: () => user });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
