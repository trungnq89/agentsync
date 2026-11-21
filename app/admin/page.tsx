import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { listAllUsers } from '@/server/org';
import { getStaleBusinessDays } from '@/server/settings';
import { getAdminActor } from '../_lib/actor';
import { createUserAction, resetPasswordAction, staleDaysAction, updateUserAction } from '../_actions/admin';
import { ActionForm, button, buttonQuiet, card, input } from '../_components/ui';

export const metadata = { title: 'Quản trị · AgentSync' };
export const dynamic = 'force-dynamic';

const LEVELS = ['director', 'manager', 'leader', 'member'] as const;

export default async function AdminPage() {
  const actor = await getAdminActor();
  const tLevel = await getTranslations('level');
  const db = getDb();
  const [users, staleDays] = await Promise.all([listAllUsers(db, actor), getStaleBusinessDays(db)]);
  const levelSelect = (value: string) => (
    <select name="level" defaultValue={value} className={input} aria-label="Cấp">
      {LEVELS.map((l) => <option key={l} value={l}>{tLevel(l)}</option>)}
    </select>
  );
  const managerSelect = (value: string | null, exclude?: string) => (
    <select name="managerId" defaultValue={value ?? ''} className={input} aria-label="Quản lý">
      <option value="">Không có</option>
      {users.filter((u) => u.id !== exclude && (!u.disabledAt || u.id === value)).map((u) => (
        <option key={u.id} value={u.id}>{u.displayName}{u.disabledAt ? ' (đã vô hiệu hóa)' : ''}</option>
      ))}
    </select>
  );
  return (
    <main className="space-y-8">
      <h1 className="text-xl font-semibold">Quản trị</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Ngưỡng &quot;lâu không cập nhật&quot;</h2>
        <ActionForm action={staleDaysAction} className="flex flex-wrap items-end gap-2" testId="stale-form">
          <label className="text-sm">Số ngày làm việc
            <input name="days" type="number" min={1} max={30} defaultValue={staleDays} required className={`${input} mt-1 w-28`} />
          </label>
          <button type="submit" className={button}>Lưu</button>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Tạo người dùng</h2>
        <ActionForm action={createUserAction} className={`${card} grid gap-3 sm:grid-cols-2`} testId="create-user">
          <label className="text-sm">Tên đăng nhập
            <input name="username" required className={`${input} mt-1`} />
          </label>
          <label className="text-sm">Tên hiển thị
            <input name="displayName" required className={`${input} mt-1`} />
          </label>
          <label className="text-sm">Mật khẩu
            <input name="password" type="password" autoComplete="new-password" required className={`${input} mt-1`} />
          </label>
          <label className="text-sm">Cấp
            {levelSelect('member')}
          </label>
          <label className="text-sm">Quản lý
            {managerSelect(null)}
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" name="isAdmin" /> Admin
          </label>
          <div className="sm:col-span-2"><button type="submit" className={button}>Tạo</button></div>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Người dùng ({users.length})</h2>
        <ul className="space-y-3" data-testid="user-list">
          {users.map((u) => (
            <li key={u.id} className={`${card} space-y-3`} data-testid={`user-${u.username}`}>
              <ActionForm action={updateUserAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input type="hidden" name="userId" value={u.id} />
                <div className="text-sm sm:col-span-2 lg:col-span-3">
                  <span className="font-medium">{u.username}</span>
                  {u.disabledAt && <span className="ml-2 text-neutral-500">(đã vô hiệu hóa)</span>}
                </div>
                <label className="text-sm">Tên
                  <input name="displayName" defaultValue={u.displayName} required className={`${input} mt-1`} />
                </label>
                <label className="text-sm">Cấp
                  {levelSelect(u.level)}
                </label>
                <label className="text-sm">Quản lý
                  {managerSelect(u.managerId, u.id)}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isAdmin" defaultChecked={u.isAdmin} /> Admin
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="disabled" defaultChecked={!!u.disabledAt} /> Vô hiệu hóa
                </label>
                <div><button type="submit" className={button}>Lưu</button></div>
              </ActionForm>
              <ActionForm action={resetPasswordAction} className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <input type="hidden" name="userId" value={u.id} />
                <label className="min-w-0 flex-1 text-sm">Đặt lại mật khẩu
                  <input name="password" type="password" autoComplete="new-password" required className={`${input} mt-1`} />
                </label>
                <button type="submit" className={buttonQuiet}>Đặt lại</button>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
