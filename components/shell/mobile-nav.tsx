'use client';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('nav');
  const items = [
    { id: 'home', href: '/', label: t('home') },
    { id: 'settings', href: '/settings', label: t('settings') },
    ...(isAdmin ? [{ id: 'admin', href: '/admin', label: t('admin') }] : []),
  ];
  return (
    <div className="sm:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('menu')} data-testid="mobile-nav-toggle">
            <Menu className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          {items.map((i) => (
            <DropdownMenuItem key={i.id} asChild>
              <Link href={i.href} data-testid={`mobile-nav-${i.id}`}>{i.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
