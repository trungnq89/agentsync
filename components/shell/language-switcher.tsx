'use client';
import { useTransition } from 'react';
import { Check, Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { setLocaleAction } from '../../app/_actions/preferences';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function LanguageSwitcher() {
  const t = useTranslations('common');
  const current = useLocale();
  const [pending, startTransition] = useTransition();
  const options = [
    { value: 'en', label: t('english') },
    { value: 'vi', label: t('vietnamese') },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('language')} title={t('language')} data-testid="lang-switch" disabled={pending}>
          <Languages className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => startTransition(() => setLocaleAction(o.value))}>
            <Check className={o.value === current ? 'h-4 w-4' : 'h-4 w-4 opacity-0'} aria-hidden />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
