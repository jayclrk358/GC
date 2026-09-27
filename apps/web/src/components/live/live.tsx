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

/** Refreshes a community's pages when it changes: settings, members, pages, wiki. */
export function CommunityLive({
  communityId,
  userId,
}: {
  communityId: string;
  userId: string | null;
}) {
  const auto = useAutoUpdates();
  const pathname = usePathname();
  const refresh = useLiveRefresh();
  // Settings pages are where the changes are made; their forms keep their own state.
  const active = auto && !pathname.includes('/settings');
  useRoom(active ? `community:${communityId}` : null, {
    'community:changed': (p: { communityId: string; actorId: string | null }) => {
      // The person who made the change already sees it.
      if (p.communityId === communityId && p.actorId !== userId) refresh();
    },
  });
  return null;
}
