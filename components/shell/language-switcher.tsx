'use client';
import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { setLocaleAction } from '../../app/_actions/preferences';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function LanguageSwitcher() {
  const t = useTranslations('common');
  const tn = useTranslations('nav');
  const current = useLocale();
  const [pending, startTransition] = useTransition();
  const options = [
    { value: 'en', label: t('english') },
    { value: 'vi', label: t('vietnamese') },
  ];
  const change = (value: string) =>
    startTransition(async () => {
      if (!(await setLocaleAction(value).catch(() => false))) toast.error(tn('preferenceFailed'));
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('language')} title={t('language')} data-testid="lang-switch" disabled={pending}>
          <Languages className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={current} onValueChange={change}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
