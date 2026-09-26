import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';
import { PaletteButton, SignInButtons, UserMenu } from './header-client';
import { NavLink } from './nav-link';
import { ThemeToggle } from './theme-toggle';

export async function SiteHeader({
  user,
  extra,
}: {
  user: SessionUser | null;
  extra?: React.ReactNode;
}) {
  const t = await getTranslations('shell');
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-ui font-heading text-lg font-bold"
        >
          <Logo />
          <span>Magnox</span>
        </Link>
        <nav aria-label={t('mainNav')} className="hidden md:block">
          <ul className="flex items-center gap-1">
            <li>
              <NavLink href="/explore">{t('explore')}</NavLink>
            </li>
            <li>
              <NavLink href="/servers">{t('servers')}</NavLink>
            </li>
          </ul>
        </nav>
        <div className="ms-auto flex min-w-0 items-center gap-2">
          <PaletteButton />
          <ThemeToggle />
          {extra}
          {user ? (
            <>
              <Button asChild size="sm" variant="secondary" className="hidden sm:inline-flex">
                <Link href="/new">
                  <Plus aria-hidden /> {t('createCommunity')}
                </Link>
              </Button>
              <UserMenu
                user={{
                  name: user.name,
                  username: (user as { username?: string | null }).username ?? null,
                  image: user.image ?? null,
                }}
              />
            </>
          ) : (
            <SignInButtons />
          )}
        </div>
      </div>
      <nav aria-label={t('mainNav')} className="border-t border-border md:hidden">
        <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-1">
          <li>
            <NavLink href="/explore">{t('explore')}</NavLink>
          </li>
          <li>
            <NavLink href="/servers">{t('servers')}</NavLink>
          </li>
          {user && (
            <li>
              <NavLink href="/new">{t('createCommunity')}</NavLink>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
