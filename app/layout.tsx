import type { Metadata } from 'next';
import Link from 'next/link';
import { logoutAction } from './_actions/auth';
import { getOptionalActor } from './_lib/actor';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentSync',
  description: 'AgentSync',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalActor();
  const link = 'rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800';
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {user && (
          <header className="border-b border-neutral-200 dark:border-neutral-800">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <Link href="/" className="mr-2 text-base font-semibold">
                AgentSync
              </Link>
              <nav className="flex flex-wrap items-center gap-1">
                <Link href="/" className={link}>Trang chủ</Link>
                <Link href="/settings" className={link}>Cài đặt</Link>
                {user.isAdmin && <Link href="/admin" className={link}>Quản trị</Link>}
              </nav>
              <form action={logoutAction} className="ml-auto">
                <button type="submit" className={link}>Đăng xuất</button>
              </form>
            </div>
          </header>
        )}
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
