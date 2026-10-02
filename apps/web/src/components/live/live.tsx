'use client';

import { usePathname } from 'next/navigation';
import { useAutoRefresh, useAutoUpdates, useLiveRefresh } from '@/lib/live';
import { useRoom } from '@/lib/realtime';

/**
 * Keeps the current page fresh. With `every`, refreshes on that interval (seconds) while the tab
 * is visible; always refreshes when the reader returns after `away` seconds or more.
 */
export function AutoRefresh({
  every = null,
  away = 120,
}: {
  every?: number | null;
  away?: number;
}) {
  useAutoRefresh(every, away);
  return null;
}

type ChangeScope = 'layout' | 'members' | 'page' | 'servers' | 'events' | 'wiki' | 'forum';

/** Whether a page at `path` (inside /c/<slug>) shows what a change affected. */
function showsScope(scope: ChangeScope | undefined, path: string): boolean {
  const landing = path === '' || path === '/';
  switch (scope) {
    case 'members':
      return path.startsWith('/members');
    case 'page':
      return landing;
    case 'servers':
      return landing || path.startsWith('/servers');
    case 'events':
      return landing || path.startsWith('/events');
    case 'wiki':
      return path.startsWith('/wiki');
    case 'forum':
      return landing || path.startsWith('/forum') || path.startsWith('/t/');
    default:
      // The whole community changed (theme, name, channels, roles, plan).
      return true;
  }
}

/** Refreshes a community's pages when something they show changes. */
export function CommunityLive({
  communityId,
  slug,
  userId,
}: {
  communityId: string;
  slug: string;
  userId: string | null;
}) {
  const auto = useAutoUpdates();
  const pathname = usePathname();
  const refresh = useLiveRefresh();
  // Settings pages are where the changes are made; their forms keep their own state.
  const active = auto && !pathname.includes('/settings');
  useRoom(active ? `community:${communityId}` : null, {
    'community:changed': (p: {
      communityId: string;
      actorId: string | null;
      scope?: ChangeScope;
    }) => {
      // The person who made the change already sees it.
      if (p.communityId !== communityId || p.actorId === userId) return;
      const path = pathname.slice(`/c/${slug}`.length);
      if (!showsScope(p.scope, path)) return;
      // Spread out: in a busy community everyone refreshing in the same second adds up.
      refresh(Math.random() * 3000);
    },
  });
  return null;
}
