import { redirect } from 'next/navigation';
import { getOptionalActor } from '../../_lib/actor';
import { loginAction } from '../../_actions/auth';
import { ActionForm, button, input } from '../../_components/ui';

export const metadata = { title: 'Đăng nhập · AgentSync' };

export default async function LoginPage() {
  if (await getOptionalActor()) redirect('/');
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">AgentSync</h1>
      <ActionForm action={loginAction} className="space-y-4">
        <label className="block text-sm">
          Tên đăng nhập
          <input name="username" autoComplete="username" required className={`${input} mt-1`} />
        </label>
        <label className="block text-sm">
          Mật khẩu
          <input name="password" type="password" autoComplete="current-password" required className={`${input} mt-1`} />
        </label>
        <button type="submit" className={`${button} w-full`}>
          Đăng nhập
        </button>
      </ActionForm>
    </main>
  );
}
