'use client';
import { createTokenAction } from '../_actions/settings';
import { ActionForm, button, card, input } from './ui';

export function TokenForm({ mcpUrl }: { mcpUrl: string }) {
  return (
    <ActionForm
      action={createTokenAction}
      className="space-y-3"
      testId="token-form"
      render={(s) =>
        s.token ? (
          <div className={`${card} mt-3 space-y-3`} data-testid="new-token">
            <p className="text-sm font-medium">Token mới (chỉ hiện một lần, hãy copy ngay):</p>
            <code data-testid="token-plaintext" className="block break-all rounded bg-neutral-100 p-2 text-sm dark:bg-neutral-800">
              {s.token}
            </code>
            <p className="text-sm">Claude Code:</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">{`claude mcp add --transport http agentsync ${mcpUrl} --header "Authorization: Bearer ${s.token}"`}</pre>
            <p className="text-sm">Hoặc cấu hình JSON:</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">{JSON.stringify(
              { mcpServers: { agentsync: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${s.token}` } } } },
              null,
              2,
            )}</pre>
          </div>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        <input name="label" placeholder="Nhãn (vd: Laptop công ty)" aria-label="Nhãn token" required className={`${input} min-w-0 flex-1`} />
        <button type="submit" className={button}>Tạo token</button>
      </div>
    </ActionForm>
  );
}
