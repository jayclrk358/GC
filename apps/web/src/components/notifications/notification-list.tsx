'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutoUpdates } from '@/lib/live';
import { useUserEvents } from '@/lib/realtime';
import { markReadAction } from '@/app/actions/notifications';
import { NotificationItem, type NotificationData } from './notification-item';

/** Full notification history with paging and live updates. */
export function NotificationList({
  initial,
  initialHasMore,
  unreadOnly,
}: {
  initial: NotificationData[];
  initialHasMore: boolean;
  unreadOnly: boolean;
}) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [loading, setLoading] = React.useState(false);
  const [fresh, setFresh] = React.useState(0);
  const [lastInitial, setLastInitial] = React.useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setItems(initial);
    setHasMore(initialHasMore);
    setFresh(0);
  }

  const auto = useAutoUpdates();
  // New ones are fetched and added at the top (a burst at once), rather than redrawing the page.
  const pending = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(pending.current), []);
  const fetchNewest = React.useCallback(() => {
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(async () => {
      const r = await fetch(`/api/notifications${unreadOnly ? '?unread=1' : ''}`, {
        cache: 'no-store',
      });
      if (!r.ok) return;
      const data = (await r.json()) as { items: NotificationData[] };
      setItems((list) => {
        const known = new Set(list.map((i) => i.id));
        const added = data.items.filter((i) => !known.has(i.id));
        return added.length ? [...added, ...list] : list;
      });
    }, 800);
  }, [unreadOnly]);

  useUserEvents({
    'notification:new': () => {
      if (auto) fetchNewest();
      else setFresh((n) => n + 1);
    },
    'notification:read': (p: { ids: 'all' | string[] }) =>
      setItems((list) =>
        list.map((i) =>
          p.ids === 'all' || p.ids.includes(i.id)
            ? { ...i, readAt: i.readAt ?? new Date().toISOString() }
            : i,
        ),
      ),
  });

  async function more() {
    setLoading(true);
    const last = items.at(-1);
    const r = await fetch(
      `/api/notifications?before=${last?.id ?? ''}${unreadOnly ? '&unread=1' : ''}`,
      { cache: 'no-store' },
    );
    setLoading(false);
    if (!r.ok) return;
    const data = (await r.json()) as { items: NotificationData[]; hasMore: boolean };
    setItems((list) => [...list, ...data.items]);
    setHasMore(data.hasMore);
  }

  const anyUnread = items.some((i) => !i.readAt);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-muted">
          {fresh > 0 ? (
            <button
              type="button"
              className="font-semibold text-primary underline"
              onClick={() => router.refresh()}
            >
              {t('freshCount', { count: fresh })}
            </button>
          ) : null}
        </p>
        {anyUnread && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              setItems((list) =>
                list.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })),
              );
              await markReadAction('all');
            }}
          >
            <CheckCheck aria-hidden /> {t('markAllRead')}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-ui-lg border border-border bg-surface p-8 text-center text-muted">
          {unreadOnly ? t('emptyUnread') : t('empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-ui-lg border border-border bg-surface p-1">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem n={n} onOpen={(x) => !x.readAt && void markReadAction([x.id])} />
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void more()} loading={loading}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
