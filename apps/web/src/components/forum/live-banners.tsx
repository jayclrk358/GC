'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoom } from '@/lib/realtime';

/**
 * New content is announced, never inserted under the reader's feet: a banner offers to load it.
 * That keeps focus and scroll position stable for keyboard and screen reader users.
 */
function Banner({ count, label, onLoad }: { count: number; label: string; onLoad: () => void }) {
  const t = useTranslations('forum');
  return (
    <div role="status" aria-live="polite">
      {count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-ui border border-primary/50 bg-primary/5 px-4 py-2">
          <span className="font-semibold">{label}</span>
          <Button size="sm" onClick={onLoad}>
            <RefreshCw aria-hidden /> {t('showNew')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ChannelLiveBanner({ channelId }: { channelId: string }) {
  const t = useTranslations('forum');
  const router = useRouter();
  const [count, setCount] = React.useState(0);
  useRoom(`channel:${channelId}`, {
    'thread:new': (p: { channelId: string }) => {
      if (p.channelId === channelId) setCount((c) => c + 1);
    },
  });
  return (
    <Banner
      count={count}
      label={t('newThreads', { count })}
      onLoad={() => {
        setCount(0);
        router.refresh();
      }}
    />
  );
}

export function ThreadLiveBanner({ threadId, userId }: { threadId: string; userId: string | null }) {
  const t = useTranslations('forum');
  const router = useRouter();
  const [count, setCount] = React.useState(0);
  useRoom(`thread:${threadId}`, {
    'post:new': (p: { threadId: string; authorId: string | null }) => {
      if (p.threadId === threadId && p.authorId !== userId) setCount((c) => c + 1);
    },
    // Edits, deletions and reactions refresh quietly; they don't move content around.
    'post:edited': (p: { threadId: string }) => p.threadId === threadId && router.refresh(),
    'post:deleted': (p: { threadId: string }) => p.threadId === threadId && router.refresh(),
    'post:reactions': (p: { threadId: string }) => p.threadId === threadId && router.refresh(),
  });
  return (
    <Banner
      count={count}
      label={t('newReplies', { count })}
      onLoad={() => {
        setCount(0);
        router.refresh();
      }}
    />
  );
}
