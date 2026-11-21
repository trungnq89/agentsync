'use client';
import { useTransition } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { logoutAction } from '../../app/_actions/auth';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const t = useTranslations('nav');
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-[10rem] px-1.5 sm:px-2" aria-label={t('account')} data-testid="user-menu" disabled={pending}>
          <Avatar name={name} src={avatarUrl ?? undefined} className="h-6 w-6" />
          <span className="hidden truncate sm:inline">{name}</span>
          <ChevronDown className="hidden h-3.5 w-3.5 sm:inline" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[16rem]">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="logout" onSelect={() => startTransition(() => logoutAction())}>
          <LogOut className="h-4 w-4" aria-hidden />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
