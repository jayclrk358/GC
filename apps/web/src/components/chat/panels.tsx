'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import type { ChatAuthor, MessageSearchHit, MessageView } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, Spinner } from '@/components/ui/misc';
import { UserLink } from '@/components/profile/user-hover-card';
import { StyledName } from '@/components/community/role-decor';
import { RichText } from '@/components/rich-text/rich-text';
import { useChat } from './chat-context';
import { formatDay, formatTime } from './format';
import { cn } from '@/lib/utils';
import { systemText } from './system-message';

export type PanelKind = 'pins' | 'search' | 'mentions' | 'members';

interface Props {
  kind: PanelKind;
  onClose: () => void;
  /** Open a message: in this channel or another one. */
  onOpen: (m: MessageView, channelName: string) => void;
  /** Bumped when pins change so the list refetches. */
  pinsVersion: number;
}

function useJson<T>(url: string | null, deps: unknown[] = []) {
  const key = url ? `${url}#${deps.join(',')}` : null;
  // Results are stored with the request they answer, so "loading" is simply a stale key.
  const [result, setResult] = React.useState<{
    key: string;
    data: T | null;
    error: boolean;
  } | null>(null);
  React.useEffect(() => {
    if (!url || !key) return;
    let live = true;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => live && setResult({ key, data, error: false }))
      .catch(() => live && setResult({ key, data: null, error: true }));
    return () => {
      live = false;
    };
  }, [url, key]);
  const fresh = result?.key === key;
  return {
    data: result?.data ?? null,
    error: fresh ? result.error : false,
    loading: Boolean(key) && !fresh,
  };
}

export function ChatPanel({ kind, onClose, onOpen, pinsVersion }: Props) {
  const t = useTranslations('chat');
  const titles: Record<PanelKind, string> = {
    pins: t('pinsTitle'),
    search: t('searchTitle'),
    mentions: t('mentionsTitle'),
    members: t('membersTitle'),
  };
  return (
    <aside
      id="chat-panel"
      aria-labelledby="chat-panel-h"
      className="absolute inset-0 z-20 flex flex-col border-s border-border bg-surface lg:static lg:inset-auto lg:w-80 lg:shrink-0"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 id="chat-panel-h" className="font-bold">
          {titles[kind]}
        </h2>
        <Button size="icon-sm" variant="ghost" aria-label={t('closePanel')} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {kind === 'pins' && <PinsPanel onOpen={onOpen} version={pinsVersion} />}
        {kind === 'search' && <SearchPanel onOpen={onOpen} />}
        {kind === 'mentions' && <MentionsPanel onOpen={onOpen} />}
        {kind === 'members' && <MembersPanel />}
      </div>
    </aside>
  );
}

function MessageCard({
  m,
  channelName,
  snippet,
  onOpen,
}: {
  m: MessageView;
  channelName?: string;
  snippet?: string;
  onOpen: () => void;
}) {
  const t = useTranslations('chat');
  const { prefs } = useChat();
  const name =
    m.kind !== 'user' ? 'Magnox' : m.author?.nickname || m.author?.name || t('deletedUser');
  return (
    <article
      className="rounded-ui border border-border bg-surface p-2 text-sm"
      aria-label={t('cardLabel', { name })}
    >
      <p className="flex flex-wrap items-baseline gap-x-2">
        <StyledName
          name={name}
          style={m.kind === 'user' ? m.author?.nameStyle : null}
          className="font-semibold"
        />
        {channelName && <span className="text-xs text-muted">#{channelName}</span>}
        <time dateTime={m.createdAt} className="text-xs text-muted">
          {formatDay(m.createdAt, { today: t('today'), yesterday: t('yesterday') })}{' '}
          {formatTime(m.createdAt, prefs.timeFormat)}
        </time>
      </p>
      {m.kind !== 'user' ? (
        <p className="mt-1">{systemText(m, t)}</p>
      ) : snippet ? (
        <p className="mt-1 line-clamp-4">
          {snippet
            .split(/(«[^»]*»)/g)
            .map((part, i) =>
              part.startsWith('«') ? (
                <mark key={i}>{part.slice(1, -1)}</mark>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
        </p>
      ) : (
        <div className="mt-1 line-clamp-4">
          <RichText doc={m.body} className="chat-body" />
        </div>
      )}
      <Button size="sm" variant="ghost" className="mt-1" onClick={onOpen}>
        {t('jump')}
        <span className="sr-only"> {t('toMessageFrom', { name })}</span>
      </Button>
    </article>
  );
}

function Status({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  emptyText: string;
}) {
  const t = useTranslations('chat');
  if (loading)
    return (
      <div className="grid place-items-center p-6">
        <Spinner label={t('loading')} />
      </div>
    );
  if (error) return <p className="p-4 text-sm text-danger">{t('loadFailed')}</p>;
  if (empty) return <p className="p-4 text-sm text-muted">{emptyText}</p>;
  return null;
}

function PinsPanel({ onOpen, version }: { onOpen: Props['onOpen']; version: number }) {
  const t = useTranslations('chat');
  const { communityId, channel } = useChat();
  const { data, loading, error } = useJson<{ messages: MessageView[] }>(
    `/api/communities/${communityId}/chat/${channel.id}/pins`,
    [version],
  );
  const list = data?.messages ?? [];
  return (
    <>
      <Status
        loading={loading && !data}
        error={error}
        empty={!list.length}
        emptyText={t('noPins')}
      />
      <ul className="flex flex-col gap-2">
        {list.map((m) => (
          <li key={m.id}>
            <MessageCard m={m} onOpen={() => onOpen(m, channel.name)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function SearchPanel({ onOpen }: { onOpen: Props['onOpen'] }) {
  const t = useTranslations('chat');
  const { communityId } = useChat();
  const [q, setQ] = React.useState('');
  const [submitted, setSubmitted] = React.useState('');
  const { data, loading, error } = useJson<{ results: MessageSearchHit[] }>(
    submitted
      ? `/api/communities/${communityId}/chat/search?q=${encodeURIComponent(submitted)}`
      : null,
  );
  const results = data?.results ?? [];
  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <label htmlFor="chat-search-q" className="sr-only">
          {t('searchLabel')}
        </label>
        <Input
          id="chat-search-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          autoFocus
        />
        <Button type="submit" size="icon" variant="outline" aria-label={t('searchTitle')}>
          <Search aria-hidden />
        </Button>
      </form>
      <p className="text-xs text-muted">{t('searchTips')}</p>
      {submitted && (
        <p role="status" className="text-sm text-muted">
          {loading ? t('searching') : t('resultCount', { count: results.length })}
        </p>
      )}
      <Status loading={false} error={error} empty={false} emptyText="" />
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r.message.id}>
            <MessageCard
              m={r.message}
              channelName={r.channelName}
              snippet={r.snippet}
              onOpen={() => onOpen(r.message, r.channelName)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MentionsPanel({ onOpen }: { onOpen: Props['onOpen'] }) {
  const t = useTranslations('chat');
  const { communityId } = useChat();
  const { data, loading, error } = useJson<{
    results: { message: MessageView; channelName: string }[];
  }>(`/api/communities/${communityId}/chat/mentions`);
  const list = data?.results ?? [];
  return (
    <>
      <Status loading={loading} error={error} empty={!list.length} emptyText={t('noMentions')} />
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.message.id}>
            <MessageCard
              m={r.message}
              channelName={r.channelName}
              onOpen={() => onOpen(r.message, r.channelName)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function MembersPanel() {
  const t = useTranslations('chat');
  const { communityId } = useChat();
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    // Only while someone's looking: a hidden tab catches up when it's shown again.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const { data, loading, error } = useJson<{
    groups: {
      id: string;
      name: string;
      color: string | null;
      members: (ChatAuthor & { online: boolean })[];
      total: number;
    }[];
    online: number;
    members: number;
  }>(`/api/communities/${communityId}/chat/members`, [tick]);
  const groups = data?.groups ?? [];
  return (
    <>
      <Status
        loading={loading && !data}
        error={error}
        empty={Boolean(data) && !groups.length}
        emptyText={t('nobodyOnline')}
      />
      {groups.map((g) => {
        const heading =
          g.id === 'offline' ? t('offlineGroup') : g.id === 'online' ? t('onlineGroup') : g.name;
        const headingId = `members-${g.id}`;
        return (
          <section key={g.id} aria-labelledby={headingId} className="mb-4">
            {/* "Moderators — 3", as Discord does. */}
            <h3
              id={headingId}
              className="px-2 pt-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase"
            >
              {heading} — {g.total}
            </h3>
            <ul className="flex flex-col gap-px">
              {g.members.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-ui-sm px-2 py-1 hover:bg-fg/[0.07]',
                    !m.online && 'opacity-55 hover:opacity-100',
                  )}
                >
                  <Avatar
                    src={m.image}
                    name={m.nickname || m.name}
                    size={32}
                    presence={m.online ? m.id : undefined}
                  />
                  <span className="min-w-0 leading-tight">
                    {m.username ? (
                      <UserLink
                        username={m.username}
                        communityId={communityId}
                        className="block truncate text-[0.9375rem] font-medium hover:underline"
                      >
                        <StyledName
                          name={m.nickname || m.name}
                          style={m.online ? m.nameStyle : null}
                        />
                      </UserLink>
                    ) : (
                      <span className="block truncate text-[0.9375rem] font-medium">
                        <StyledName name={m.nickname || m.name} style={null} />
                      </span>
                    )}
                    {m.roleName && g.id !== 'offline' && (
                      <span className="block truncate text-xs text-muted">{m.roleName}</span>
                    )}
                  </span>
                  {!m.online && <span className="sr-only">{t('offlineSr')}</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {data && data.groups.some((g) => g.members.length < g.total) && (
        <p className="px-2 text-xs text-muted">{t('membersMore')}</p>
      )}
    </>
  );
}

/** The member list beside the messages on wide screens (Discord's right-hand column). */
export function MemberColumn() {
  const t = useTranslations('chat');
  return (
    <aside
      aria-label={t('membersTitle')}
      className="hidden w-60 shrink-0 flex-col border-s border-border/60 bg-rail xl:flex"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <MembersPanel />
      </div>
    </aside>
  );
}
