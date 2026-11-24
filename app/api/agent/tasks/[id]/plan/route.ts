import { getDb } from '@/db';
import { authenticateAgentToken } from '@/server/auth/tokens';
import { DomainError } from '@/server/errors';
import { getOwnTaskPlan } from '@/server/tasks/queries';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unauthorized = () => json({ error: 'unauthorized' }, 401);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const db = getDb();
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return unauthorized();
  try {
    const { user } = await authenticateAgentToken(db, m[1]);
    const { id } = await params;
    return json(await getOwnTaskPlan(db, user, id), 200);
  } catch (e) {
    if (e instanceof DomainError) {
      if (e.code === 'NOT_FOUND') return json({ error: 'not_found' }, 404);
      if (e.code === 'UNAUTHORIZED') return unauthorized();
    }
    console.error('[agent-plan] failed', e);
    return json({ error: 'server_error' }, 500);
  }
}
