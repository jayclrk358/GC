'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { useUserEvents } from '@/lib/realtime';
import { markReadAction } from '@/app/actions/notifications';
import { NotificationItem, type NotificationData } from './notification-item';

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations('notifications');
  const [unread, setUnread] = React.useState(initialUnread);
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationData[] | null>(null);
  const [announce, setAnnounce] = React.useState('');

  const load = React.useCallback(async () => {
    const r = await fetch('/api/notifications', { cache: 'no-store' });
    if (!r.ok) return;
    const data = (await r.json()) as { items: NotificationData[]; unread: number };
    setItems(data.items);
    setUnread(data.unread);
  }, []);

  useUserEvents({
    'notification:new': (p: { type: string; data: { title?: string } }) => {
      setUnread((n) => Math.min(999, n + 1));
      setItems(null);
      const text = t('newNotification', { title: p.data.title ?? '' });
      setAnnounce(text);
      if (p.type === 'mention' || p.type === 'reply') toast(text);
    },
    'notification:read': (p: { ids: 'all' | string[] }) => {
      if (p.ids === 'all') setUnread(0);
      else setUnread((n) => Math.max(0, n - p.ids.length));
      setItems(
        (list) =>
          list?.map((i) =>
            p.ids === 'all' || p.ids.includes(i.id)
              ? { ...i, readAt: i.readAt ?? new Date().toISOString() }
              : i,
          ) ?? null,
      );
    },
  });

  async function markAll() {
    setUnread(0);
    setItems(
      (list) => list?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null,
    );
    await markReadAction('all');
  }

  function opened(n: NotificationData) {
    setOpen(false);
    if (!n.readAt) void markReadAction([n.id]);
  }

  const label = unread ? t('bellUnread', { count: unread }) : t('bell');
  return (
    <>
      <p role="status" className="sr-only">
        {announce}
      </p>
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o && items === null) void load();
        }}
      >
        <Popover.Trigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={label} className="relative">
            <Bell aria-hidden />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute -end-0.5 -top-0.5 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-bg"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            aria-labelledby="notif-pop-h"
            className="mx-menu z-50 flex max-h-[min(32rem,80vh)] w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-ui-lg border border-border bg-surface text-fg shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <h2 id="notif-pop-h" className="font-bold">
                {t('title')}
              </h2>
              {unread > 0 && (
                <Button size="sm" variant="ghost" onClick={() => void markAll()}>
                  <CheckCheck aria-hidden /> {t('markAllRead')}
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {items === null ? (
                <div className="grid place-items-center p-6">
                  <Spinner label={t('loading')} />
                </div>
              ) : items.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">{t('empty')}</p>
              ) : (
                <ul>
                  {items.map((n) => (
                    <li key={n.id}>
                      <NotificationItem n={n} onOpen={opened} compact />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
              <Link
                href="/notifications"
                className="font-semibold text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                {t('seeAll')}
              </Link>
              <Link
                href="/settings/notifications"
                className="text-muted hover:underline"
                onClick={() => setOpen(false)}
              >
                {t('settings')}
              </Link>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
