'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Hash, Plus } from 'lucide-react';
import type { MessageView } from '@magnox/core';
import { mentionsMe } from '@magnox/shared';
import { useRooms, useUserEvents } from '@/lib/realtime';
import { cn } from '@/lib/utils';

interface SidebarChannel {
  id: string;
  name: string;
}

interface Props {
  slug: string;
  categories: { id: string | null; name: string; channels: SidebarChannel[] }[];
  initialUnreads: Record<string, { unread: boolean; mentions: number }>;
  me: { id: string; roleIds: string[] } | null;
  canManage: boolean;
}

/** Text channels with live unread and mention counts. */
export function ChannelSidebar({ slug, categories, initialUnreads, me, canManage }: Props) {
  const t = useTranslations('chat');
  const pathname = usePathname();
  const base = `/c/${slug}/chat`;
  const all = categories.flatMap((c) => c.channels);
  const active = all.find((c) => pathname === `${base}/${c.name}`)?.id ?? null;
  const [unreads, setUnreads] = React.useState(initialUnreads);
  // Opening a channel reads it.
  const [lastActive, setLastActive] = React.useState<string | null>(null);
  if (active !== lastActive) {
    setLastActive(active);
    if (active && (unreads[active]?.unread || unreads[active]?.mentions)) {
      setUnreads((u) => ({ ...u, [active]: { unread: false, mentions: 0 } }));
    }
  }

  // Unread dots are only for signed-in people; visitors don't need every channel's messages.
  useRooms(me ? all.map((c) => `channel:${c.id}`) : [], {
    'message:new': (p: { channelId: string; message: MessageView }) => {
      if (p.channelId === active || !me || p.message.authorId === me.id) return;
      const pinged = mentionsMe(p.message, me.id, me.roleIds);
      setUnreads((u) => ({
        ...u,
        [p.channelId]: {
          unread: true,
          mentions: (u[p.channelId]?.mentions ?? 0) + (pinged ? 1 : 0),
        },
      }));
    },
  });
  useUserEvents(
    {
      'channel:read': (p: { channelId: string }) =>
        setUnreads((u) => ({ ...u, [p.channelId]: { unread: false, mentions: 0 } })),
    },
    Boolean(me),
  );

  const list = (
    <>
      {categories.map((cat) => (
        <div key={cat.id ?? 'none'} className="mb-3">
          {cat.name && (
            <p
              aria-hidden
              className="px-2 pb-1 text-xs font-bold tracking-wide text-muted uppercase"
            >
              {cat.name}
            </p>
          )}
          <ul aria-label={cat.name || t('channels')}>
            {cat.channels.map((c) => {
              const u = unreads[c.id];
              const isActive = c.id === active;
              const unread = !isActive && u?.unread;
              const mentions = isActive ? 0 : (u?.mentions ?? 0);
              return (
                <li key={c.id}>
                  <Link
                    href={`${base}/${c.name}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-1.5 rounded-ui-sm px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-surface-2 aria-[current=page]:font-semibold aria-[current=page]:text-fg',
                      unread && 'font-bold text-fg',
                    )}
                  >
                    <Hash className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {unread && !mentions && (
                      <span aria-hidden className="size-2 rounded-full bg-fg" />
                    )}
                    {unread && !mentions && <span className="sr-only">{t('unreadSr')}</span>}
                    {mentions > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-bg tabular-nums">
                        {mentions > 99 ? '99+' : mentions}
                        <span className="sr-only"> {t('mentionsSr', { count: mentions })}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {canManage && (
        <Link
          href={`/c/${slug}/settings/channels`}
          className="flex items-center gap-1.5 rounded-ui-sm px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
        >
          <Plus className="size-4" aria-hidden /> {t('manageChannels')}
        </Link>
      )}
    </>
  );

  const current = all.find((c) => c.id === active);
  const totalMentions = Object.entries(unreads).reduce(
    (n, [id, u]) => (id === active ? n : n + u.mentions),
    0,
  );
  return (
    <>
      <nav
        aria-label={t('channels')}
        className="hidden w-56 shrink-0 overflow-y-auto border-e border-border p-2 md:block"
      >
        {list}
      </nav>
      <details className="border-b border-border md:hidden">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold">
          {t('channels')}: #{current?.name ?? ''}
          {totalMentions > 0 && (
            <span className="rounded-full bg-danger px-1.5 text-xs text-bg">{totalMentions}</span>
          )}
        </summary>
        <nav aria-label={t('channels')} className="max-h-72 overflow-y-auto p-2">
          {list}
        </nav>
      </details>
    </>
  );
}
