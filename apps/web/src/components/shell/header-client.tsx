'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Accessibility, LogOut, Search, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, Kbd } from '@/components/ui/misc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import { formatCombo } from '@/lib/shortcuts';
import { usePalette } from './app-providers';
import { useShortcutCombos } from './shortcuts-provider';

export function PaletteButton() {
  const t = useTranslations('shell');
  const { openPalette } = usePalette();
  const combos = useShortcutCombos();
  const combo = combos.palette;
  return (
    <button
      type="button"
      onClick={openPalette}
      className="flex h-9 min-w-0 items-center gap-2 rounded-ui border border-border bg-surface-2 px-3 text-sm text-muted hover:text-fg sm:w-72"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="hidden truncate sm:inline">{t('openPalette')}</span>
      <span className="sr-only sm:hidden">{t('openPalette')}</span>
      {combo && (
        <Kbd className="ms-auto hidden whitespace-nowrap sm:inline-flex" aria-hidden>
          {formatCombo(combo).join(' ')}
        </Kbd>
      )}
    </button>
  );
}

export function UserMenu({
  user,
}: {
  user: { name: string; username: string | null; image: string | null };
}) {
  const t = useTranslations('shell');
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full"
          aria-label={t('userMenu', { name: user.name })}
        >
          <Avatar src={user.image} name={user.name} size={34} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block text-sm text-fg">{user.name}</span>
          {user.username && <span className="block">@{user.username}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.username && (
          <DropdownMenuItem asChild>
            <Link href={`/u/${user.username}`}>
              <User aria-hidden /> {t('profile')}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden /> {t('settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/accessibility">
            <Accessibility aria-hidden /> {t('accessibility')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push('/');
            router.refresh();
          }}
        >
          <LogOut aria-hidden /> {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SignInButtons() {
  const t = useTranslations('shell');
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href="/sign-in">{t('signIn')}</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/sign-up">{t('signUp')}</Link>
      </Button>
    </div>
  );
}
