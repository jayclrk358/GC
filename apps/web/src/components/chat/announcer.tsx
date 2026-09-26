'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { summariseForAnnouncement, type AnnounceItem, type ChatVerbosity } from '@magnox/shared';

export interface AnnouncerHandle {
  push: (item: AnnounceItem) => void;
}

const WINDOW_MS = 1500;

/**
 * Screen-reader announcements for incoming chat, separate from the message log so they can be
 * throttled: bursts are summarised ("4 new messages from Ana and Bo") instead of read one by
 * one, and the reader's verbosity preference (all, mentions only, off) is honoured.
 */
export const ChatAnnouncer = React.forwardRef<AnnouncerHandle, { verbosity: ChatVerbosity }>(
  function ChatAnnouncer({ verbosity }, ref) {
    const t = useTranslations('chat');
    const [text, setText] = React.useState('');
    const buffer = React.useRef<AnnounceItem[]>([]);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const flip = React.useRef(false);
    const verbosityRef = React.useRef(verbosity);
    React.useEffect(() => {
      verbosityRef.current = verbosity;
    });

    React.useImperativeHandle(
      ref,
      () => ({
        push: (item) => {
          buffer.current.push(item);
          if (timer.current) return;
          timer.current = setTimeout(() => {
            timer.current = null;
            const items = buffer.current;
            buffer.current = [];
            const a = summariseForAnnouncement(items, verbosityRef.current);
            if (!a) return;
            const message =
              a.kind === 'single'
                ? a.mention
                  ? t('announceMention', { name: a.authorName, text: a.text })
                  : t('announceOne', { name: a.authorName, text: a.text })
                : t('announceMany', {
                    count: a.count,
                    authors: a.authors.join(', '),
                    mentions: a.mentions,
                  });
            // A trailing invisible character forces a repeat of identical text to be read again.
            flip.current = !flip.current;
            setText(message + (flip.current ? '​' : ''));
          }, WINDOW_MS);
        },
      }),
      [t],
    );

    React.useEffect(
      () => () => {
        if (timer.current) clearTimeout(timer.current);
      },
      [],
    );

    return (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="chat-announcer"
      >
        {text}
      </div>
    );
  },
);

/** "Ana is typing…" under the composer. Not a live region: it would be far too chatty. */
export function TypingIndicator({ names }: { names: string[] }) {
  const t = useTranslations('chat');
  const text =
    names.length === 0
      ? ''
      : names.length === 1
        ? t('typingOne', { name: names[0]! })
        : names.length === 2
          ? t('typingTwo', { a: names[0]!, b: names[1]! })
          : t('typingMany');
  return (
    <p className="h-5 truncate px-4 text-xs text-muted" aria-hidden={!text}>
      {text && (
        <>
          <span aria-hidden className="me-1 inline-flex gap-0.5 align-middle">
            <span className="size-1 animate-bounce rounded-full bg-current motion-reduce:animate-none" />
            <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:150ms] motion-reduce:animate-none" />
            <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:300ms] motion-reduce:animate-none" />
          </span>
          {text}
        </>
      )}
    </p>
  );
}
