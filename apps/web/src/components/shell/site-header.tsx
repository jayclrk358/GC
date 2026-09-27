import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { unreadCount } from '@magnox/core';
import type { SessionUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';
import { PaletteButton, SignInButtons, UserMenu } from './header-client';
import { MobileNav } from './mobile-nav';
import { ThemeToggle } from './theme-toggle';
import type { SidebarCommunity } from './app-sidebar';
import { NotificationBell } from '@/components/notifications/notification-bell';

/** The slim bar above the content: search in the middle, account actions on the end. */
export async function SiteHeader({
  user,
  communities,
}: {
  user: SessionUser | null;
  communities: SidebarCommunity[];
}) {
  const t = await getTranslations('shell');
  const unread = user ? await unreadCount(user.id).catch(() => 0) : 0;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <MobileNav communities={communities} signedIn={Boolean(user)} />
        <Link
          href="/"
          className="mx-press flex shrink-0 items-center gap-2 rounded-ui font-heading text-lg font-bold lg:hidden"
        >
          <Logo id="mx-logo-header" />
          {/* On the narrowest phones the tile alone carries the brand. */}
          <span className="max-[359px]:sr-only">Magnox</span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-end sm:justify-center">
          <PaletteButton />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {user ? (
            <>
              <Button asChild size="sm" className="hidden md:inline-flex">
                <Link href="/new">
                  <Plus aria-hidden /> {t('createCommunity')}
                </Link>
              </Button>
              <NotificationBell initialUnread={unread} />
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
    </header>
  );
}
