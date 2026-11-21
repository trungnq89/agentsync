'use client';
import { useEffect, useTransition } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setThemeAction } from '../../app/_actions/preferences';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { THEMES, type Theme } from '@/ui/theme';

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Keeps `html.dark` in line with the chosen theme (server only renders it for explicit dark). */
function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeSwitcher({ theme }: { theme: Theme }) {
  const t = useTranslations('theme');
  const [pending, startTransition] = useTransition();
  useEffect(() => applyTheme(theme), [theme]);
  const Icon = ICONS[theme];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('label')} title={t('label')} data-testid="theme-switch" disabled={pending}>
          <Icon className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map((value) => {
          const ItemIcon = ICONS[value];
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => {
                applyTheme(value);
                startTransition(() => setThemeAction(value));
              }}
            >
              <ItemIcon className="h-4 w-4" aria-hidden />
              {t(value)}
              <Check className={value === theme ? 'ml-auto h-4 w-4' : 'ml-auto h-4 w-4 opacity-0'} aria-hidden />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
