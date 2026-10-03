'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, Hash } from 'lucide-react';
import { startsNewGroup } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { useChat } from './chat-context';
import { MessageItem } from './message-item';
import { SystemMessage } from './system-message';
import { formatDay } from './format';
import type { ChatMessage } from './types';

export interface ScrollRequest {
  id: string;
  /** Changes on every request so the same message can be jumped to twice. */
  seq: number;
  focus: boolean;
}

interface Props {
  messages: ChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  history: boolean;
  loading: 'older' | 'newer' | null;
  unreadDividerId: string | null;
  highlightId: string | null;
  unseen: number;
  scrollRequest: ScrollRequest | null;
  onLoadOlder: () => Promise<void>;
  onLoadNewer: () => Promise<void>;
  onJumpToPresent: () => void;
  onAtBottomChange: (atBottom: boolean) => void;
}

const PAGE_STEP = 10;

export function MessageList(props: Props) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const { channel, prefs, me, perms, actions } = useChat();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);
  const [atBottom, setAtBottom] = React.useState(true);
  const anchorRef = React.useRef<{ id: string; top: number } | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const cb = React.useRef(props);
  React.useEffect(() => {
    cb.current = props;
  });

  const ids = props.messages.map((m) => m.id);
  const activeId = focusedId && ids.includes(focusedId) ? focusedId : (ids.at(-1) ?? null);

  const smooth = prefs.motion === 'full' ? 'smooth' : 'auto';

  // Keep the reader's place when older messages are added above, and stay pinned to the
  // bottom while they're at the live end.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = anchorRef.current;
    if (anchor) {
      anchorRef.current = null;
      const node = el.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`);
      if (node) el.scrollTop += node.getBoundingClientRect().top - anchor.top;
      return;
    }
    if (atBottomRef.current && !props.hasMoreAfter) el.scrollTop = el.scrollHeight;
  }, [props.messages, props.hasMoreAfter]);

  // Jump requests: scroll a message into view and optionally move focus to it.
  React.useLayoutEffect(() => {
    const req = props.scrollRequest;
    const el = scrollRef.current;
    if (!req || !el) return;
    const node =
      el.querySelector<HTMLElement>(`[data-message-id="${req.id}"]`) ??
      (req.id === 'unread' ? el.querySelector<HTMLElement>('#chat-unread-divider') : null);
    if (!node) return;
    node.scrollIntoView({ block: 'center' });
    if (req.focus && node.dataset.messageId) {
      setFocusedId(node.dataset.messageId);
      node.focus({ preventScroll: true });
    }
  }, [props.scrollRequest]);

  function loadOlder() {
    const el = scrollRef.current;
    if (!el || props.loading || !props.hasMoreBefore) return;
    const first = el.querySelector<HTMLElement>('[data-message-id]');
    if (first)
      anchorRef.current = { id: first.dataset.messageId!, top: first.getBoundingClientRect().top };
    void props.onLoadOlder();
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom;
      setAtBottom(bottom);
      cb.current.onAtBottomChange(bottom);
    }
    if (el.scrollTop < 300) loadOlder();
    if (bottom && props.hasMoreAfter && !props.loading) void props.onLoadNewer();
  }

  function focusMessage(id: string | undefined) {
    if (!id) return;
    setFocusedId(id);
    const node = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    const id = target.dataset.messageId;
    if (!id || target.tagName !== 'ARTICLE') return;
    const i = ids.indexOf(id);
    const m = props.messages[i];
    const move = (to: number) => {
      e.preventDefault();
      focusMessage(ids[Math.max(0, Math.min(ids.length - 1, to))]);
    };
    switch (e.key) {
      case 'ArrowUp':
        if (i === 0) {
          e.preventDefault();
          loadOlder();
        } else move(i - 1);
        return;
      case 'ArrowDown':
        if (i === ids.length - 1) {
          e.preventDefault();
          if (props.hasMoreAfter) void props.onLoadNewer();
        } else move(i + 1);
        return;
      case 'PageUp':
        return move(i - PAGE_STEP);
      case 'PageDown':
        return move(i + PAGE_STEP);
      case 'Home':
        return move(0);
      case 'End':
        return move(ids.length - 1);
      case 'Escape':
        e.preventDefault();
        actions.focusComposer();
        return;
    }
    if (
      !m ||
      m.pending ||
      m.failed ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      !prefs.singleKeyShortcuts
    )
      return;
    const own = me && m.authorId === me.id;
    if (e.key === 'r' && perms.send) {
      e.preventDefault();
      actions.reply(m);
    } else if (e.key === 'e' && own && perms.send) {
      e.preventDefault();
      actions.startEdit(m);
    } else if (e.key === 'p' && perms.manage) {
      e.preventDefault();
      actions.pin(m, !m.pinned);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && (own || perms.manage)) {
      e.preventDefault();
      actions.remove(m);
    }
  }

  const dayLabels = { today: t('today'), yesterday: t('yesterday') };
  const rows: React.ReactNode[] = [];
  props.messages.forEach((m, i) => {
    const prev = props.messages[i - 1];
    const newDay =
      !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    if (newDay) {
      const label = formatDay(m.createdAt, dayLabels, locale);
      rows.push(
        <div
          key={`day-${m.id}`}
          role="separator"
          aria-label={label}
          className="relative my-3 flex items-center px-4"
        >
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span aria-hidden className="mx-3 text-xs font-semibold text-muted">
            {label}
          </span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>,
      );
    }
    if (m.id === props.unreadDividerId) {
      rows.push(
        <div
          key="unread"
          id="chat-unread-divider"
          role="separator"
          aria-label={t('newMessages')}
          className="relative my-2 flex items-center px-4"
        >
          <span aria-hidden className="h-px flex-1 bg-danger" />
          <span
            aria-hidden
            className="ms-2 rounded-ui-sm bg-danger px-1.5 text-xs font-bold text-bg"
          >
            {t('new')}
          </span>
        </div>,
      );
    }
    if (m.kind !== 'user') {
      rows.push(
        <SystemMessage
          key={m.id}
          message={m}
          highlighted={props.highlightId === m.id}
          tabIndex={m.id === activeId ? 0 : -1}
          onFocus={setFocusedId}
        />,
      );
      return;
    }
    const grouped =
      !newDay &&
      m.id !== props.unreadDividerId &&
      prev?.kind === 'user' &&
      !startsNewGroup(prev, {
        authorId: m.authorId,
        createdAt: m.createdAt,
        replyToId: m.replyTo?.id ?? null,
      });
    rows.push(
      <MessageItem
        key={m.nonce && m.pending ? `n-${m.nonce}` : m.id}
        message={m}
        grouped={grouped}
        highlighted={props.highlightId === m.id}
        tabIndex={m.id === activeId ? 0 : -1}
        onFocus={setFocusedId}
      />,
    );
  });

  const showJump = !atBottom || props.hasMoreAfter;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
        style={{ overflowAnchor: 'none' }}
      >
        <div
          role="log"
          aria-live="off"
          aria-label={t('logLabel', { channel: channel.name })}
          aria-describedby="chat-log-help"
          aria-busy={props.loading !== null}
          onKeyDown={onKeyDown}
        >
          {props.hasMoreBefore ? (
            <div className="flex justify-center py-3">
              {props.loading === 'older' ? (
                <Spinner label={t('loadingOlder')} />
              ) : (
                <Button size="sm" variant="ghost" onClick={loadOlder}>
                  {t('loadOlder')}
                </Button>
              )}
            </div>
          ) : (
            <div className="px-4 pt-6 pb-2">
              <span
                aria-hidden
                className="mb-2 grid size-12 place-items-center rounded-full bg-surface-2"
              >
                <Hash className="size-6 text-muted" />
              </span>
              <p className="text-xl font-bold">{t('welcomeTitle', { channel: channel.name })}</p>
              <p className="text-muted">
                {props.history ? t('welcomeBody', { channel: channel.name }) : t('noHistory')}
              </p>
            </div>
          )}
          {rows}
          {props.loading === 'newer' && (
            <div className="flex justify-center py-3">
              <Spinner label={t('loadingNewer')} />
            </div>
          )}
        </div>
      </div>
      <p id="chat-log-help" className="sr-only">
        {prefs.singleKeyShortcuts ? t('logHelp') : t('logHelpNoKeys')}
      </p>
      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            className="pointer-events-auto shadow-lg"
            onClick={() => {
              atBottomRef.current = true;
              setAtBottom(true);
              props.onJumpToPresent();
              requestAnimationFrame(() =>
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: smooth,
                }),
              );
            }}
          >
            <ArrowDown aria-hidden />
            {props.unseen > 0 ? t('newBelow', { count: props.unseen }) : t('jumpToPresent')}
          </Button>
        </div>
      )}
    </div>
  );
}
