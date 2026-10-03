'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, Hash, Plus, Volume2 } from 'lucide-react';
import { mentionsMe } from '@gamecentral/shared';
import { useRooms, useUserEvents } from '@/lib/realtime';
import { useStored } from '@/lib/use-stored';
import { cn } from '@/lib/utils';
import { VoiceChannelPeople } from '@/components/voice/voice-people';
import { useVoice } from '@/components/voice/voice-provider';
import { UserPanel, type PanelUser } from './user-panel';

/** A message somewhere else in the community: just enough for an unread dot. */
interface ChannelActivity {
  channelId: string;
  id: string;
  authorId: string | null;
  mentionUserIds: string[];
  mentionRoleIds: string[];
  mentionEveryone: boolean;
}

interface SidebarChannel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'separator';
}

interface Props {
  slug: string;
  communityName: string;
  categories: { id: string | null; name: string; channels: SidebarChannel[] }[];
  initialUnreads: Record<string, { unread: boolean; mentions: number }>;
  me: { id: string; roleIds: string[] } | null;
  /** The signed-in person, for the panel at the bottom. */
  user: PanelUser | null;
  canManage: boolean;
  /** Most people in one voice channel on this community's plan. */
  voiceLimit: number;
}

/**
 * The channel list, Discord-style: collapsible categories, chat channels with unread markers,
 * voice channels with who's in them (TeamSpeak-style, with who's talking), and your own panel at
 * the bottom with the call you're in.
 */
export function ChannelSidebar({
  slug,
  communityName,
  categories,
  initialUnreads,
  me,
  user,
  canManage,
  voiceLimit,
}: Props) {
  const t = useTranslations('chat');
  const voice = useVoice();
  const pathname = usePathname();
  const base = `/c/${slug}/chat`;
  const all = categories.flatMap((c) => c.channels).filter((c) => c.type !== 'separator');
  const text = all.filter((c) => c.type === 'text');
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
  const [collapsedRaw, setCollapsed] = useStored(`mx-chat-collapsed:${slug}`, '');
  const collapsed = new Set(collapsedRaw.split(',').filter(Boolean));
  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed([...next].join(','));
  };

  // Unread dots are only for signed-in people. Each channel sends just a small ping per message
  // (the open channel's messages come through the chat view instead).
  useRooms(me ? text.map((c) => `channel:${c.id}`) : [], {
    'channel:activity': (p: ChannelActivity) => {
      if (p.channelId === active || !me || p.authorId === me.id) return;
      const pinged = mentionsMe(p, me.id, me.roleIds);
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

  const occupied = (id: string) => (voice?.people[id]?.length ?? 0) > 0;

  function row(c: SidebarChannel) {
    if (c.type === 'separator') {
      return (
        <li key={c.id} className="px-2 pt-3 pb-1">
          <div
            role="separator"
            aria-label={c.name || undefined}
            className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted uppercase"
          >
            <span aria-hidden className="h-px flex-1 bg-border" />
            {c.name && <span aria-hidden>{c.name}</span>}
            {c.name && <span aria-hidden className="h-px flex-1 bg-border" />}
          </div>
        </li>
      );
    }
    const isActive = c.id === active;
    const u = unreads[c.id];
    const unread = !isActive && Boolean(u?.unread);
    const mentions = isActive ? 0 : (u?.mentions ?? 0);
    const Icon = c.type === 'voice' ? Volume2 : Hash;
    const inCall = voice?.channelId === c.id && voice.status !== 'idle';
    const count = c.type === 'voice' ? (voice?.people[c.id]?.length ?? 0) : 0;
    return (
      <li key={c.id} className="relative">
        {/* Discord's unread marker: a small pill at the edge of the list. */}
        {(unread || mentions > 0) && (
          <span
            aria-hidden
            className="absolute -start-2 top-[15px] h-2 w-1 -translate-y-1/2 rounded-e-full bg-fg"
          />
        )}
        <Link
          href={`${base}/${c.name}`}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'flex items-center gap-1.5 rounded-ui-sm px-2 py-[5px] text-[0.9375rem] text-muted transition-colors hover:bg-fg/[0.07] hover:text-fg',
            isActive && 'bg-fg/[0.11] font-medium text-fg hover:bg-fg/[0.11]',
            (unread || mentions > 0) && 'font-semibold text-fg',
          )}
        >
          <Icon
            className={cn(
              'size-[1.15rem] shrink-0 opacity-70',
              inCall && 'text-success opacity-100',
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          {c.type === 'voice' && <span className="sr-only">{t('voiceChannelSr')}</span>}
          {unread && !mentions && <span className="sr-only">{t('unreadSr')}</span>}
          {mentions > 0 && (
            <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-xs leading-5 font-bold text-white tabular-nums">
              {mentions > 99 ? '99+' : mentions}
              <span className="sr-only"> {t('mentionsSr', { count: mentions })}</span>
            </span>
          )}
          {count > 0 && (
            // TeamSpeak-style head count against the room's limit.
            <span className="rounded bg-bg/60 px-1 text-[11px] font-semibold text-muted tabular-nums">
              {voiceLimit ? t('voiceCount', { count, limit: voiceLimit }) : count}
            </span>
          )}
        </Link>
        {c.type === 'voice' && <VoiceChannelPeople channelId={c.id} />}
      </li>
    );
  }

  // Drawn twice (the desktop column and the phone drop-down), so ids carry a prefix.
  const list = (prefix: string) => (
    <>
      {categories.map((cat) => {
        const key = cat.id ?? 'none';
        const shut = Boolean(cat.name) && collapsed.has(key);
        // A closed category still shows the open channel, unread ones and busy voice channels.
        const shown = shut
          ? cat.channels.filter(
              (c) =>
                c.id === active ||
                (c.type === 'text' && (unreads[c.id]?.unread || unreads[c.id]?.mentions)) ||
                (c.type === 'voice' && occupied(c.id)),
            )
          : cat.channels;
        const listId = `${prefix}-cat-${key}`;
        return (
          <section key={key} className="mt-4 first:mt-1">
            {cat.name && (
              <button
                type="button"
                aria-expanded={!shut}
                aria-controls={listId}
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-0.5 rounded px-0.5 py-0.5 text-start text-[11px] font-bold tracking-wider text-muted uppercase hover:text-fg"
              >
                <ChevronDown
                  aria-hidden
                  className={cn('size-3 shrink-0 transition-transform', shut && '-rotate-90')}
                />
                <span className="truncate">{cat.name}</span>
              </button>
            )}
            <ul
              id={listId}
              aria-label={cat.name || t('channels')}
              className="mt-0.5 flex flex-col gap-px"
            >
              {shown.map(row)}
            </ul>
          </section>
        );
      })}
      {canManage && (
        <Link
          href={`/c/${slug}/settings/channels`}
          className="mt-4 flex items-center gap-1.5 rounded-ui-sm px-2 py-1.5 text-sm text-muted hover:bg-fg/[0.07] hover:text-fg"
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
      <div className="hidden w-60 shrink-0 flex-col border-e border-border/60 bg-rail md:flex">
        <nav aria-label={t('channels')} className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-3">
          {list('chat')}
        </nav>
        <UserPanel slug={slug} communityName={communityName} user={user} />
      </div>
      <details className="border-b border-border bg-rail md:hidden">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold">
          {t('channels')}: {current?.type === 'voice' ? '' : '#'}
          {current?.name ?? ''}
          {totalMentions > 0 && (
            <span className="rounded-full bg-danger px-1.5 text-xs text-white">
              {totalMentions}
            </span>
          )}
        </summary>
        <nav aria-label={t('channels')} className="max-h-72 overflow-y-auto p-2">
          {list('chat-m')}
        </nav>
      </details>
    </>
  );
}
