import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

/** Segmented navigation between the admin sections (Users | Odoo | Slack). */
export async function AdminTabs({ active }: { active: 'users' | 'odoo' | 'slack' }) {
  const t = await getTranslations('admin');
  const tabs = [
    { id: 'users', href: '/admin', label: t('tabUsers') },
    { id: 'odoo', href: '/admin/odoo', label: t('tabOdoo') },
    { id: 'slack', href: '/admin/slack', label: t('tabSlack') },
  ] as const;
  return (
    <nav aria-label={t('tabsLabel')} className="inline-flex rounded-lg border border-border bg-surface-muted p-1" data-testid="admin-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground',
            tab.id === active && 'bg-surface text-foreground shadow-sm',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
