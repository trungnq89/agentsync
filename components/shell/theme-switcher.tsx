'use client';
import { useLayoutEffect, useTransition } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { setThemeAction } from '../../app/_actions/preferences';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isTheme, THEMES, type Theme } from '@/ui/theme';

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Keeps `html.dark` in line with the chosen theme (server only renders it for explicit dark). */
function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeSwitcher({ theme }: { theme: Theme }) {
  const t = useTranslations('theme');
  const tn = useTranslations('nav');
  const [pending, startTransition] = useTransition();
  // Layout effect: runs before paint, so re-renders never expose a stale class.
  useLayoutEffect(() => applyTheme(theme), [theme]);
  const Icon = ICONS[theme];
  const change = (value: string) => {
    if (!isTheme(value)) return;
    applyTheme(value);
    startTransition(async () => {
      if (!(await setThemeAction(value))) {
        applyTheme(theme);
        toast.error(tn('preferenceFailed'));
      }
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('label')} title={t('label')} data-testid="theme-switch" disabled={pending}>
          <Icon className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={change}>
          {THEMES.map((value) => {
            const ItemIcon = ICONS[value];
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <ItemIcon className="h-4 w-4" aria-hidden />
                {t(value)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
