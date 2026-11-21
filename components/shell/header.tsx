import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { User } from '@/db/schema';
import type { Theme } from '@/ui/theme';
import { LanguageSwitcher } from './language-switcher';
import { MobileNav } from './mobile-nav';
import { ThemeSwitcher } from './theme-switcher';
import { UserMenu } from './user-menu';

const navLink = 'rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground';

export async function Header({ user, theme }: { user: User | null; theme: Theme }) {
  const t = await getTranslations('nav');
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2 text-sm sm:gap-2">
        {user && <MobileNav isAdmin={user.isAdmin} />}
        <Link href="/" className="mr-1 text-base font-semibold tracking-tight sm:mr-3">
          AgentSync
        </Link>
        {user && (
          <nav aria-label={t('main')} className="hidden items-center gap-1 sm:flex">
            <Link href="/" className={navLink} data-testid="nav-home">{t('home')}</Link>
            <Link href="/settings" className={navLink} data-testid="nav-settings">{t('settings')}</Link>
            {user.isAdmin && <Link href="/admin" className={navLink} data-testid="nav-admin">{t('admin')}</Link>}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <LanguageSwitcher />
          <ThemeSwitcher theme={theme} />
          {user && <UserMenu name={user.displayName} avatarUrl={user.avatarUrl} />}
        </div>
      </div>
    </header>
  );
}
