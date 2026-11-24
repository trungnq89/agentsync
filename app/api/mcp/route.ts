import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { getDb } from '@/db';
import { defaultLocale, isLocale } from '@/i18n/config';
import { registerTools } from '@/mcp/tools';
import { authenticateAgentToken } from '@/server/auth/tokens';
import { DomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 });

async function handle(req: Request): Promise<Response> {
  const db = getDb();
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return unauthorized();
  let auth;
  try {
    auth = await authenticateAgentToken(db, m[1]);
  } catch (e) {
    if (e instanceof DomainError) return unauthorized();
    console.error('[mcp] auth failed', e);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
  const { user, token } = auth;
  // Stateless: a fresh server + transport per request.
  const server = new McpServer({ name: 'agentsync', version: '0.1.0' });
  registerTools(server, {
    db,
    getActor: () => ({ ...user, tokenScope: token.scope }),
    locale: isLocale(user.locale) ? user.locale : defaultLocale(),
    tokenScope: token.scope,
    token: { expiresAt: token.expiresAt, legacy: token.legacy },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

const methodNotAllowed = () =>
  Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });

// Stateless server: no SSE stream and no sessions to delete.
export { handle as POST, methodNotAllowed as GET, methodNotAllowed as DELETE };
