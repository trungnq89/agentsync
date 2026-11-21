import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { listMyTokens } from '@/server/account';
import { getActor } from '../_lib/actor';
import { changePasswordAction, revokeTokenAction, sendModeAction } from '../_actions/settings';
import { TokenForm } from '../_components/token-form';
import { ActionForm, button, buttonQuiet, card, input } from '../_components/ui';

export const metadata = { title: 'Cài đặt · AgentSync' };
export const dynamic = 'force-dynamic';

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(d) : 'Chưa dùng';

export default async function SettingsPage() {
  const actor = await getActor();
  const tSendMode = await getTranslations('sendMode');
  const tokens = await listMyTokens(getDb(), actor);
  const mcpUrl = `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/mcp`;
  return (
    <main className="space-y-8">
      <h1 className="text-xl font-semibold">Cài đặt</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Token cho agent</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Dùng token để kết nối Claude Code hoặc Codex với AgentSync qua MCP.
        </p>
        <TokenForm mcpUrl={mcpUrl} />
        <ul className="space-y-2" data-testid="token-list">
          {tokens.length === 0 && <li className="text-sm text-neutral-500">Chưa có token nào.</li>}
          {tokens.map((t) => (
            <li key={t.id} className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 text-sm`}>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.label}</div>
                <div className="text-neutral-500">
                  <code>{t.prefix}…</code> · Dùng gần nhất: {fmt(t.lastUsedAt)}
                </div>
              </div>
              {t.revokedAt ? (
                <span className="text-neutral-500">Đã thu hồi</span>
              ) : (
                <ActionForm action={revokeTokenAction}>
                  <input type="hidden" name="tokenId" value={t.id} />
                  <button type="submit" className={buttonQuiet}>Thu hồi</button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Chế độ gửi cập nhật</h2>
        <ActionForm action={sendModeAction} className="space-y-3">
          {(['review', 'auto'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="sendMode" value={m} defaultChecked={actor.sendMode === m} />
              {tSendMode(m)}
            </label>
          ))}
          <button type="submit" className={button}>Lưu</button>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Đổi mật khẩu</h2>
        <ActionForm action={changePasswordAction} className="max-w-sm space-y-3">
          <label className="block text-sm">Mật khẩu hiện tại
            <input name="current" type="password" autoComplete="current-password" required className={`${input} mt-1`} />
          </label>
          <label className="block text-sm">Mật khẩu mới
            <input name="next" type="password" autoComplete="new-password" required className={`${input} mt-1`} />
          </label>
          <label className="block text-sm">Nhập lại mật khẩu mới
            <input name="confirm" type="password" autoComplete="new-password" required className={`${input} mt-1`} />
          </label>
          <button type="submit" className={button}>Đổi mật khẩu</button>
        </ActionForm>
      </section>
    </main>
  );
}
