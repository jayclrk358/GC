'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AtSign, Hash, Megaphone, Pin, Search, Users } from 'lucide-react';
import type { MessagePage, MessageView } from '@magnox/core';
import {
  docToText,
  mentionsMe,
  type ChatVerbosity,
  type CustomEmoji,
  type RichNode,
} from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert } from '@/components/ui/misc';
import { usePrefs } from '@/components/shell/prefs-provider';
import type { ImgSources } from '@/lib/media';
import { ReportDialog } from '@/components/moderation/report-dialog';
import { EmojiProvider } from '@/components/emoji/emoji-context';
import { MuteMenu } from '@/components/notifications/mute-menu';
import { useReconnect, useRoom } from '@/lib/realtime';
import { useStored } from '@/lib/use-stored';
import { cn } from '@/lib/utils';
import {
  ackChannelAction,
  deleteMessageAction,
  editMessageAction,
  sendMessageAction,
  setMessagePinnedAction,
  toggleMessageReactionAction,
} from '@/app/actions/chat';
import { ChatProvider, type ChatActions } from './chat-context';
import { chatReducer, type ChatState } from './chat-state';
import { MessageList, type ScrollRequest } from './message-list';
import { authorName } from './message-item';
import { systemText } from './system-message';
import { Composer, type ComposerHandle, type SendInput } from './composer';
import { ChatAnnouncer, TypingIndicator, type AnnouncerHandle } from './announcer';
import { ChatPanel, MemberColumn, type PanelKind } from './panels';
import { formatTime } from './format';
import type { ChatChannelInfo, ChatMe, ChatMessage, ChatPerms } from './types';

interface Props {
  communityId: string;
  slug: string;
  channel: ChatChannelInfo;
  me: ChatMe | null;
  perms: ChatPerms;
  blocked: string[];
  initial: MessagePage;
  /** Everything after this id was unread when the page loaded. */
  lastReadId: string | null;
  muted: boolean;
  requireAlt: boolean;
  focusMessageId: string | null;
  notice: React.ReactNode;
  /** A picture behind the messages (a paid perk), dimmed by `dim` percent. */
  background?: { image: ImgSources; dim: number } | null;
  /** The community's custom emoji, for reactions. */
  emoji?: CustomEmoji[];
}

const TYPING_TTL = 7000;
const NO_EMOJI: CustomEmoji[] = [];

export function ChatView(props: Props) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const router = useRouter();
  const { prefs, save: savePrefs } = usePrefs();
  const { communityId, channel, me, perms } = props;
  const initialState: ChatState = {
    messages: props.initial.messages,
    hasMoreBefore: props.initial.hasMoreBefore,
    hasMoreAfter: props.initial.hasMoreAfter,
    history: props.initial.history,
  };
  const [state, dispatch] = React.useReducer(chatReducer, initialState);
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  });
  const [loading, setLoading] = React.useState<'older' | 'newer' | null>(null);
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ChatMessage | null>(null);
  const [reporting, setReporting] = React.useState<ChatMessage | null>(null);
  const [panel, setPanel] = React.useState<PanelKind | null>(null);
  // The member list beside the messages on wide screens, remembered open or closed.
  const [membersPref, setMembersPref] = useStored('mx-chat-members', 'open');
  const membersOpen = membersPref === 'open';
  const [pinsVersion, setPinsVersion] = React.useState(0);
  const [typers, setTypers] = React.useState<Record<string, { name: string; until: number }>>({});
  const [unseen, setUnseen] = React.useState(0);
  const [highlightId, setHighlightId] = React.useState<string | null>(props.focusMessageId);
  const [scrollRequest, setScrollRequest] = React.useState<ScrollRequest | null>(() =>
    props.focusMessageId ? { id: props.focusMessageId, seq: 1, focus: false } : null,
  );
  const composerRef = React.useRef<ComposerHandle>(null);
  const announcer = React.useRef<AnnouncerHandle>(null);
  const atBottom = React.useRef(!props.focusMessageId);
  const acked = React.useRef<string | null>(props.lastReadId);
  const retryInputs = React.useRef(new Map<string, SendInput>());
  const blocked = React.useMemo(() => new Set(props.blocked), [props.blocked]);

  // The "new messages" divider sits before the first message that arrived since the last visit.
  const [dividerId] = React.useState<string | null>(() => {
    if (!props.lastReadId || !me) return null;
    return (
      props.initial.messages.find((m) => m.id > props.lastReadId! && m.authorId !== me.id)?.id ??
      null
    );
  });
  const [unreadBanner, setUnreadBanner] = React.useState(Boolean(dividerId));

  const base = `/api/communities/${communityId}/chat/${channel.id}/messages`;
  async function fetchPage(qs: string): Promise<MessagePage | null> {
    const r = await fetch(`${base}${qs}`, { cache: 'no-store' });
    if (!r.ok) {
      toast.error(t('loadFailed'));
      return null;
    }
    return (await r.json()) as MessagePage;
  }

  // ── Read state ──
  // Acknowledgements are batched: the first soon after opening the channel, then at most one
  // every ten seconds while new messages arrive, plus one when the tab is hidden or the channel
  // closed. Your own messages are already marked read when sent.
  const ackTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushAck = React.useCallback(() => {
    if (ackTimer.current) {
      clearTimeout(ackTimer.current);
      ackTimer.current = null;
    }
    const now = stateRef.current;
    const latest = [...now.messages].reverse().find((m) => !m.pending && !m.failed);
    if (!latest || (acked.current && latest.id <= acked.current)) return;
    if (now.hasMoreAfter || !atBottom.current) return;
    acked.current = latest.id;
    setUnreadBanner(false);
    void ackChannelAction(communityId, channel.id, latest.id);
  }, [communityId, channel.id]);
  const maybeAck = React.useCallback(() => {
    if (!me || !perms.member) return;
    const s = stateRef.current;
    const last = [...s.messages].reverse().find((m) => !m.pending && !m.failed);
    if (!last || s.hasMoreAfter || !atBottom.current || document.visibilityState !== 'visible')
      return;
    if (acked.current && last.id <= acked.current) return;
    if (last.authorId === me.id) {
      acked.current = last.id;
      return;
    }
    if (ackTimer.current) return;
    ackTimer.current = setTimeout(flushAck, acked.current ? 10_000 : 1500);
  }, [me, perms.member, flushAck]);

  React.useEffect(() => {
    maybeAck();
  }, [state.messages, maybeAck]);
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeAck();
      else if (ackTimer.current) flushAck();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (ackTimer.current) flushAck();
    };
  }, [maybeAck, flushAck]);

  // ── Live events ──
  useRoom(`chat:${channel.id}`, {
    'message:new': (p: { channelId: string; message: MessageView }) => {
      if (p.channelId !== channel.id) return;
      const m = p.message;
      const own = Boolean(me && m.authorId === me.id);
      const known = stateRef.current.messages.some(
        (x) => x.id === m.id || (m.nonce && x.nonce === m.nonce),
      );
      dispatch({ type: 'incoming', message: m });
      const authorId = m.authorId;
      if (authorId) {
        setTypers((cur) => {
          if (!(authorId in cur)) return cur;
          const next = { ...cur };
          delete next[authorId];
          return next;
        });
      }
      if (own || known) return;
      if (!atBottom.current || stateRef.current.hasMoreAfter) setUnseen((n) => n + 1);
      if (m.authorId && blocked.has(m.authorId)) return;
      announcer.current?.push({
        authorName: authorName(m),
        text:
          m.kind !== 'user'
            ? systemText(m, t, locale)
            : docToText(m.body).slice(0, 280) || (m.attachments.length ? t('imageOnly') : ''),
        mentionsMe: mentionsMe(m, me?.id ?? null, me?.roleIds ?? []),
        own,
      });
    },
    'message:updated': (p: { channelId: string; id: string; patch: Partial<MessageView> }) => {
      if (p.channelId !== channel.id) return;
      dispatch({ type: 'patch', id: p.id, patch: p.patch });
      if ('pinned' in p.patch) setPinsVersion((v) => v + 1);
    },
    'message:deleted': (p: { channelId: string; id: string }) => {
      if (p.channelId !== channel.id) return;
      dispatch({ type: 'remove', id: p.id });
      setEditingId((id) => (id === p.id ? null : id));
      setReplyTo((r) => (r?.id === p.id ? null : r));
    },
    'message:reactions': (p: {
      channelId: string;
      id: string;
      reactions: { emoji: string; count: number }[];
      actorId: string;
      emoji: string;
      added: boolean;
    }) => {
      if (p.channelId !== channel.id) return;
      // Our own toggles were applied optimistically; the event still carries fresh counts.
      dispatch({ type: 'reactions', ...p, me: me?.id ?? null });
    },
    typing: (p: { channelId: string; userId: string; name: string }) => {
      if (p.channelId !== channel.id || p.userId === me?.id || blocked.has(p.userId)) return;
      setTypers((cur) => ({
        ...cur,
        [p.userId]: { name: p.name, until: Date.now() + TYPING_TTL },
      }));
    },
  });

  React.useEffect(() => {
    const id = setInterval(() => {
      setTypers((cur) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(cur).length ? cur : next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // After a reconnect (or a long spell in a hidden tab), fetch whatever arrived while we were
  // away. Someone at the bottom gets the latest page afresh, which also brings in edits,
  // deletions and reactions they missed; someone reading further up just gets the new messages.
  useReconnect(() => {
    const s = stateRef.current;
    if (s.hasMoreAfter) return;
    if (atBottom.current) {
      void fetchPage('').then((page) => page && dispatch({ type: 'replace', page }));
      return;
    }
    const last = [...s.messages].reverse().find((m) => !m.pending && !m.failed);
    void fetchPage(last ? `?after=${last.id}&limit=100` : '').then((page) => {
      if (!page) return;
      if (last)
        dispatch({ type: 'append', messages: page.messages, hasMoreAfter: page.hasMoreAfter });
      else dispatch({ type: 'replace', page });
    });
  });

  // ── Paging and jumping ──
  async function loadOlder() {
    const first = stateRef.current.messages.find((m) => !m.pending);
    if (!first || loading) return;
    setLoading('older');
    const page = await fetchPage(`?before=${first.id}`);
    setLoading(null);
    if (page)
      dispatch({ type: 'prepend', messages: page.messages, hasMoreBefore: page.hasMoreBefore });
  }

  async function loadNewer() {
    const last = [...stateRef.current.messages].reverse().find((m) => !m.pending && !m.failed);
    if (!last || loading) return;
    setLoading('newer');
    const page = await fetchPage(`?after=${last.id}`);
    setLoading(null);
    if (page)
      dispatch({ type: 'append', messages: page.messages, hasMoreAfter: page.hasMoreAfter });
  }

  async function jumpToPresent() {
    setUnseen(0);
    atBottom.current = true;
    if (stateRef.current.hasMoreAfter) {
      const page = await fetchPage('');
      if (page) dispatch({ type: 'replace', page });
    }
    maybeAck();
  }

  const seq = React.useRef(1);
  async function jumpTo(id: string, focus = true) {
    if (!stateRef.current.messages.some((m) => m.id === id)) {
      const page = await fetchPage(`?around=${id}`);
      if (!page) return;
      if (!page.messages.some((m) => m.id === id)) {
        toast.error(t('messageGone'));
        return;
      }
      atBottom.current = false;
      dispatch({ type: 'replace', page });
    }
    setHighlightId(id);
    setScrollRequest({ id, seq: ++seq.current, focus });
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 4000);
  }

  // ── Sending ──
  async function send(
    input: SendInput,
    nonce = crypto.randomUUID(),
  ): Promise<{ ok: boolean; retryAfter?: number }> {
    if (!me) return { ok: false };
    retryInputs.current.set(nonce, input);
    const now = new Date().toISOString();
    dispatch({
      type: 'pending',
      message: {
        id: `pending-${nonce}`,
        channelId: channel.id,
        kind: 'user',
        meta: null,
        authorId: me.id,
        author: {
          id: me.id,
          name: me.name,
          username: me.username,
          image: me.image,
          nickname: null,
          roleColor: null,
          nameStyle: null,
          roleStyle: null,
          roleIcon: null,
          roleName: null,
        },
        body: input.body,
        content: docToText(input.body),
        replyTo: replyTo
          ? {
              id: replyTo.id,
              authorId: replyTo.authorId,
              authorName: authorName(replyTo),
              authorStyle: replyTo.author?.nameStyle ?? null,
              excerpt: replyTo.content.slice(0, 120),
              deleted: false,
            }
          : null,
        mentionUserIds: [],
        mentionRoleIds: [],
        mentionEveryone: false,
        attachments: [],
        embeds: [],
        reactions: [],
        pinned: false,
        editedAt: null,
        createdAt: now,
        nonce,
        pending: true,
      },
    });
    setReplyTo(null);
    atBottom.current = true;
    const r = await sendMessageAction(communityId, channel.id, { ...input, nonce });
    if (r.ok) {
      retryInputs.current.delete(nonce);
      dispatch({ type: 'sent', nonce, message: r.data });
      return { ok: true };
    }
    if (r.code === 'held') {
      // Automod kept it back for a moderator: it isn't in the channel (yet), so don't show it.
      retryInputs.current.delete(nonce);
      dispatch({ type: 'discard', nonce });
      toast.info(r.error, { duration: 8000 });
      return { ok: true };
    }
    dispatch({ type: 'failed', nonce, error: r.error });
    return { ok: false, retryAfter: r.retryAfter };
  }

  function editLast() {
    if (!me) return;
    const mine = [...stateRef.current.messages]
      .reverse()
      .find((m) => m.authorId === me.id && !m.pending && !m.failed);
    if (mine) setEditingId(mine.id);
  }

  const actions: ChatActions = {
    reply: (m) => {
      setReplyTo(m);
      composerRef.current?.focus();
    },
    startEdit: (m) => setEditingId(m.id),
    cancelEdit: () => {
      setEditingId(null);
      composerRef.current?.focus();
    },
    saveEdit: async (m, body: RichNode) => {
      if (!docToText(body).trim() && !m.attachments.length) {
        setEditingId(null);
        setDeleting(m);
        return false;
      }
      const prev = { body: m.body, editedAt: m.editedAt };
      dispatch({ type: 'patch', id: m.id, patch: { body, editedAt: new Date().toISOString() } });
      setEditingId(null);
      const r = await editMessageAction(communityId, m.id, { body });
      if (!r.ok) {
        dispatch({ type: 'patch', id: m.id, patch: prev });
        toast.error(r.error);
        return false;
      }
      return true;
    },
    toggleReaction: (m, emoji) => {
      if (!me) return;
      const existing = m.reactions.find((r) => r.emoji === emoji);
      const added = !existing?.mine;
      const reactions = existing
        ? m.reactions
            .map((r) =>
              r.emoji === emoji
                ? { emoji, count: r.count + (added ? 1 : -1) }
                : { emoji: r.emoji, count: r.count },
            )
            .filter((r) => r.count > 0)
        : [...m.reactions.map((r) => ({ emoji: r.emoji, count: r.count })), { emoji, count: 1 }];
      dispatch({ type: 'reactions', id: m.id, reactions, actorId: me.id, emoji, added, me: me.id });
      void toggleMessageReactionAction(communityId, m.id, emoji).then((r) => {
        if (!r.ok) {
          toast.error(r.error);
          dispatch({
            type: 'reactions',
            id: m.id,
            reactions: m.reactions.map((x) => ({ emoji: x.emoji, count: x.count })),
            actorId: me.id,
            emoji,
            added: !added,
            me: me.id,
          });
        }
      });
    },
    remove: (m) => setDeleting(m),
    pin: (m, pinned) => {
      void setMessagePinnedAction(communityId, m.id, pinned).then((r) => {
        if (r.ok) toast.success(pinned ? t('pinnedToast') : t('unpinnedToast'));
        else toast.error(r.error);
      });
    },
    report: (m) => setReporting(m),
    jumpTo: (id) => void jumpTo(id),
    retry: (m) => {
      const input = m.nonce ? retryInputs.current.get(m.nonce) : undefined;
      if (!input || !m.nonce) return;
      dispatch({ type: 'discard', nonce: m.nonce });
      void send(input, m.nonce);
    },
    discard: (m) => {
      if (m.nonce) {
        retryInputs.current.delete(m.nonce);
        dispatch({ type: 'discard', nonce: m.nonce });
      }
    },
    copyLink: (m) => {
      void navigator.clipboard
        .writeText(`${window.location.origin}/c/${props.slug}/m/${m.id}`)
        .then(() => toast.success(t('linkCopied')))
        .catch(() => toast.error(t('copyFailed')));
    },
    focusComposer: () => composerRef.current?.focus(),
  };

  // Messages re-render only when what they show changes. The actions close over this render's
  // state, so route calls through a ref to a stable object; without that, every typing
  // indicator, new message or panel toggle would re-render every message in the list.
  const actionsRef = React.useRef(actions);
  React.useLayoutEffect(() => {
    actionsRef.current = actions;
  });
  const stableActions = React.useMemo(
    () =>
      new Proxy({} as ChatActions, {
        get:
          (_, k) =>
          (...args: unknown[]) =>
            (actionsRef.current[k as keyof ChatActions] as (...a: unknown[]) => unknown)(...args),
      }),
    [],
  );
  const context = React.useMemo(
    () => ({
      communityId,
      slug: props.slug,
      channel,
      me,
      perms,
      prefs,
      blocked,
      editingId,
      actions: stableActions,
    }),
    [communityId, props.slug, channel, me, perms, prefs, blocked, editingId, stableActions],
  );

  const typingNames = Object.values(typers).map((v) => v.name);
  const verbosity = prefs.chatAnnouncements as ChatVerbosity;
  const firstUnread = dividerId ? state.messages.find((m) => m.id === dividerId) : null;

  function openFromPanel(m: MessageView, channelName: string) {
    if (m.channelId === channel.id) {
      if (window.matchMedia('(max-width: 1023px)').matches) setPanel(null);
      void jumpTo(m.id);
    } else router.push(`/c/${props.slug}/chat/${channelName}?m=${m.id}`);
  }

  const panelButton = (kind: PanelKind, label: string, icon: React.ReactNode) => (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      aria-expanded={panel === kind}
      aria-controls={panel === kind ? 'chat-panel' : undefined}
      onClick={() => setPanel((p) => (p === kind ? null : kind))}
      className={cn('text-muted hover:text-fg', panel === kind && 'bg-fg/10 text-fg')}
    >
      {icon}
    </Button>
  );

  // Wide screens keep the member list beside the messages; narrower ones show it over them.
  function toggleMembers() {
    if (window.matchMedia('(min-width: 80rem)').matches) {
      setMembersPref(membersOpen ? 'closed' : 'open');
      setPanel((p) => (p === 'members' ? null : p));
    } else setPanel((p) => (p === 'members' ? null : 'members'));
  }

  return (
    <ChatProvider value={context}>
      <EmojiProvider emoji={props.emoji ?? NO_EMOJI}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border/70 px-4 py-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
            <h2 className="flex min-w-0 items-center gap-1.5 text-base font-bold">
              <Hash className="size-6 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{channel.name}</span>
            </h2>
            {channel.topic && (
              <>
                <span aria-hidden className="mx-1 hidden h-6 w-px shrink-0 bg-border md:block" />
                <p className="hidden min-w-0 flex-1 truncate text-sm text-muted md:block">
                  {channel.topic}
                </p>
              </>
            )}
            <div className="ms-auto flex items-center gap-0.5">
              {panelButton('pins', t('pinsTitle'), <Pin aria-hidden />)}
              {me &&
                perms.member &&
                panelButton('mentions', t('mentionsTitle'), <AtSign aria-hidden />)}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('membersTitle')}
                title={t('membersTitle')}
                aria-pressed={panel === 'members' || membersOpen}
                onClick={toggleMembers}
                className={cn(
                  'text-muted hover:text-fg',
                  (panel === 'members' || membersOpen) && 'xl:bg-fg/10 xl:text-fg',
                  panel === 'members' && 'bg-fg/10 text-fg',
                )}
              >
                <Users aria-hidden />
              </Button>
              {/* Search looks like a box on wide screens, as in Discord. */}
              <button
                type="button"
                aria-label={t('searchTitle')}
                aria-expanded={panel === 'search'}
                aria-controls={panel === 'search' ? 'chat-panel' : undefined}
                onClick={() => setPanel((p) => (p === 'search' ? null : 'search'))}
                className="mx-1 hidden h-7 w-36 items-center justify-between rounded-ui-sm bg-bg/70 px-2 text-sm text-muted hover:text-fg lg:flex"
              >
                {t('searchShort')}
                <Search aria-hidden className="size-4" />
              </button>
              <span className="lg:hidden">
                {panelButton('search', t('searchTitle'), <Search aria-hidden />)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('announceShort')}: ${t(`verbosity.${verbosity}`)}`}
                    title={t('announceMenu')}
                    className="text-muted hover:text-fg"
                  >
                    <Megaphone aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t('announceMenu')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={verbosity}
                    onValueChange={(v) =>
                      void savePrefs({ ...prefs, chatAnnouncements: v as ChatVerbosity })
                    }
                  >
                    {(['all', 'mentions', 'off'] as const).map((v) => (
                      <DropdownMenuRadioItem key={v} value={v}>
                        {t(`verbosity.${v}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {me && perms.member && (
                <MuteMenu
                  targetType="channel"
                  targetId={channel.id}
                  name={`#${channel.name}`}
                  muted={props.muted}
                  iconOnly
                  compact
                />
              )}
            </div>
          </header>

          <div className="relative isolate flex min-h-0 flex-1">
            {props.background && (
              <div
                aria-hidden
                data-decorative
                className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  {...props.background.image}
                  alt=""
                  decoding="async"
                  className="size-full object-cover"
                />
                {/* Dims the picture towards the page colour so messages stay easy to read. */}
                <div
                  className="absolute inset-0 bg-surface"
                  style={{ opacity: props.background.dim / 100 }}
                />
              </div>
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {unreadBanner && firstUnread && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-primary px-4 py-1.5 text-sm text-on-primary">
                  <span>
                    {t('unreadSince', {
                      time: formatTime(firstUnread.createdAt, prefs.timeFormat, locale),
                    })}
                  </span>
                  <span className="flex gap-3">
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => void jumpTo(dividerId!, true)}
                    >
                      {t('jumpToUnread')}
                    </button>
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => {
                        const last = [...state.messages].reverse().find((m) => !m.pending);
                        if (last) {
                          acked.current = last.id;
                          void ackChannelAction(communityId, channel.id, last.id);
                        }
                        setUnreadBanner(false);
                      }}
                    >
                      {t('markRead')}
                    </button>
                  </span>
                </div>
              )}
              <MessageList
                messages={state.messages}
                hasMoreBefore={state.hasMoreBefore}
                hasMoreAfter={state.hasMoreAfter}
                history={state.history}
                loading={loading}
                unreadDividerId={dividerId}
                highlightId={highlightId}
                unseen={unseen}
                scrollRequest={scrollRequest}
                onLoadOlder={loadOlder}
                onLoadNewer={loadNewer}
                onJumpToPresent={() => void jumpToPresent()}
                onAtBottomChange={(b) => {
                  atBottom.current = b;
                  if (b) {
                    setUnseen(0);
                    maybeAck();
                  }
                }}
              />
              <TypingIndicator names={typingNames} />
              {perms.send && me ? (
                <Composer
                  ref={composerRef}
                  replyTo={replyTo}
                  requireAlt={props.requireAlt}
                  onCancelReply={() => setReplyTo(null)}
                  onEditLast={editLast}
                  onSend={(input) => send(input)}
                />
              ) : (
                <div className="px-4 pb-3">{props.notice}</div>
              )}
            </div>
            {panel ? (
              <ChatPanel
                kind={panel}
                onClose={() => setPanel(null)}
                onOpen={openFromPanel}
                pinsVersion={pinsVersion}
              />
            ) : (
              membersOpen && <MemberColumn />
            )}
          </div>
          <ChatAnnouncer ref={announcer} verbosity={verbosity} />
        </div>

        <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
          {deleting && (
            <DialogContent size="sm" title={t('deleteTitle')} description={t('deleteConfirm')}>
              <blockquote className="line-clamp-4 rounded-ui border-s-4 border-border bg-surface-2 px-3 py-2 text-sm">
                {deleting.content || t('imageOnly')}
              </blockquote>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDeleting(null)}>
                  {t('cancel')}
                </Button>
                <Button
                  variant="danger"
                  autoFocus
                  onClick={async () => {
                    const m = deleting;
                    setDeleting(null);
                    const r = await deleteMessageAction(communityId, m.id);
                    if (r.ok) dispatch({ type: 'remove', id: m.id });
                    else toast.error(r.error);
                    composerRef.current?.focus();
                  }}
                >
                  {t('delete')}
                </Button>
              </div>
            </DialogContent>
          )}
        </Dialog>

        {reporting && (
          <ReportDialog
            open
            onOpenChange={(o) => !o && setReporting(null)}
            communityId={communityId}
            targetType="message"
            targetId={reporting.id}
            what={t('thisMessage')}
          />
        )}
      </EmojiProvider>
    </ChatProvider>
  );
}

/** Shown instead of the composer when the viewer can't post. */
export function ChatNotice({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Alert tone="info">
      <span className="flex flex-wrap items-center justify-between gap-2">
        {children}
        {action}
      </span>
    </Alert>
  );
}

export function SignInToChat({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <ChatNotice
      action={
        <Button asChild size="sm">
          <Link href={href}>{label}</Link>
        </Button>
      }
    >
      {text}
    </ChatNotice>
  );
}
