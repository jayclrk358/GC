'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { Prefs } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePrefs } from './prefs-provider';

type Scheme = Prefs['colorScheme'];

function useSystemDark(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  );
}

/** Light / dark / system switch in the header. Saved like every other display preference. */
export function ThemeToggle() {
  const t = useTranslations('themeToggle');
  const { prefs, save } = usePrefs();
  const systemDark = useSystemDark();
  const dark = prefs.colorScheme === 'dark' || (prefs.colorScheme === 'system' && systemDark);
  const Icon = prefs.colorScheme === 'system' ? Monitor : dark ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('label', { current: t(prefs.colorScheme) })}
        >
          <Icon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('title')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prefs.colorScheme}
          onValueChange={(v) => void save({ ...prefs, colorScheme: v as Scheme })}
        >
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden /> {t('light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden /> {t('dark')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden /> {t('system')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/accessibility">{t('more')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
