// Smoke test against a running AgentSync: pnpm smoke:mcp
// Env: AGENTSYNC_URL (base URL, no trailing slash), AGENTSYNC_TOKEN (ags_...).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type Content = { type: string; text?: string };

async function main() {
  const base = process.env.AGENTSYNC_URL?.replace(/\/+$/, '');
  const token = process.env.AGENTSYNC_TOKEN;
  if (!base || !token) {
    throw new Error('Set AGENTSYNC_URL and AGENTSYNC_TOKEN.');
  }

  const client = new Client({ name: 'agentsync-smoke', version: '0.1.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );

  async function call(name: string, args: Record<string, unknown>): Promise<Content[]> {
    const res = await client.callTool({ name, arguments: args });
    const content = (res.content ?? []) as Content[];
    if (res.isError) {
      throw new Error(`${name} returned isError: ${content.map((c) => c.text).join(' ')}`);
    }
    console.log(`ok  ${name}`);
    return content;
  }

  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const title = `Smoke ${new Date().toISOString()}`;

  const created = await call('create_task', {
    title,
    mode: 'executive',
    agreedOutcome: 'Smoke test chạy thông',
    startDate: day(0),
    agreedDueDate: day(7),
    steps: ['Bước 1', 'Bước 2'],
  });
  let taskId: string | undefined;
  for (const c of created) {
    try {
      const parsed = JSON.parse(c.text ?? '') as { id?: string };
      if (parsed && typeof parsed === 'object' && parsed.id) { taskId = parsed.id; break; }
    } catch { /* not JSON: skip */ }
  }
  if (!taskId) throw new Error('create_task did not return a task id');

  await call('update_progress', { taskId, body: 'Smoke: đã xong bước 1', stepsCompleted: ['Bước 1'], memberConfirmed: true, source: 'auto' });
  await call('get_pending_feedback', {});
  const list = await call('list_my_tasks', {});
  if (!list.some((c) => c.text?.includes(taskId))) throw new Error('list_my_tasks does not include the new task');

  await client.close();
  console.log(`SMOKE OK (task ${taskId})`);
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
