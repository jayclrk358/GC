'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutoUpdates, useLiveRefresh } from '@/lib/live';
import { useRoom } from '@/lib/realtime';

/**
 * New content either appears by itself (the default), announced politely to screen readers, or,
 * for readers who asked to be told first, waits behind a banner so nothing moves under them.
 */
function Banner({
  count,
  seq,
  label,
  auto,
  onLoad,
}: {
  count: number;
  seq: number;
  label: string;
  auto: boolean;
  onLoad: () => void;
}) {
  const t = useTranslations('forum');
  return (
    <div role="status" aria-live="polite" className={auto ? 'sr-only' : undefined}>
      {count > 0 &&
        (auto ? (
          // A new node each time, so the same words ("1 new reply") are announced again.
          <span key={seq}>{label}</span>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-ui border border-primary/50 bg-primary/5 px-4 py-2">
            <span className="font-semibold">{label}</span>
            <Button size="sm" onClick={onLoad}>
              <RefreshCw aria-hidden /> {t('showNew')}
            </Button>
          </div>
        ))}
    </div>
  );
}

/** Counts new items; in auto mode each one also triggers a (coalesced) refresh. */
function useNewItems() {
  const router = useRouter();
  const auto = useAutoUpdates();
  const refresh = useLiveRefresh();
  const [count, setCount] = React.useState(0);
  const [seq, setSeq] = React.useState(0);
  const lastAt = React.useRef(0);
  return {
    auto,
    count,
    seq,
    refresh,
    add: () => {
      // In auto mode the items are already on screen, so announce each burst on its own.
      const burst = !auto || Date.now() - lastAt.current < 5000;
      lastAt.current = Date.now();
      setCount((c) => (burst ? c + 1 : 1));
      setSeq((n) => n + 1);
      if (auto) refresh();
    },
    load: () => {
      setCount(0);
      router.refresh();
    },
  };
}

export function ChannelLiveBanner({ channelId }: { channelId: string }) {
  const t = useTranslations('forum');
  const items = useNewItems();
  useRoom(`channel:${channelId}`, {
    'thread:new': (p: { channelId: string }) => {
      if (p.channelId === channelId) items.add();
    },
    // Replies change counts and the activity order; only worth a quiet refresh in auto mode.
    'thread:activity': (p: { channelId: string }) => {
      if (p.channelId === channelId && items.auto) items.refresh();
    },
  });
  return (
    <Banner
      count={items.count}
      seq={items.seq}
      label={t('newThreads', { count: items.count })}
      auto={items.auto}
      onLoad={items.load}
    />
  );
}

export function ThreadLiveBanner({
  threadId,
  userId,
}: {
  threadId: string;
  userId: string | null;
}) {
  const t = useTranslations('forum');
  const items = useNewItems();
  useRoom(`thread:${threadId}`, {
    'post:new': (p: { threadId: string; authorId: string | null }) => {
      if (p.threadId === threadId && p.authorId !== userId) items.add();
    },
    // Edits, deletions and reactions refresh quietly; they don't move content around.
    'post:edited': (p: { threadId: string }) => p.threadId === threadId && items.refresh(),
    'post:deleted': (p: { threadId: string }) => p.threadId === threadId && items.refresh(),
    'post:reactions': (p: { threadId: string }) => p.threadId === threadId && items.refresh(),
  });
  return (
    <Banner
      count={items.count}
      seq={items.seq}
      label={t('newReplies', { count: items.count })}
      auto={items.auto}
      onLoad={items.load}
    />
  );
}
