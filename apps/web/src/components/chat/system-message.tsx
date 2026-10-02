'use client';

import * as React from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ServerCrash, ServerCog } from 'lucide-react';
import { formatDuration, type ServerAlertMeta } from '@magnox/shared';
import { cn } from '@/lib/utils';
import { useChat } from './chat-context';
import { formatTime, fullDateTime } from './format';
import type { ChatMessage } from './types';

type T = ReturnType<typeof useTranslations<'chat'>>;

/** The notice in the reader's language, from its structured details. */
export function systemText(
  m: Pick<ChatMessage, 'kind' | 'meta' | 'content'>,
  t: T,
  locale = 'en',
): string {
  const meta = (m.meta ?? {}) as Partial<ServerAlertMeta>;
  const name = meta.serverName ?? '';
  if (m.kind === 'server_down') return t('serverDown', { name });
  if (m.kind === 'server_up') {
    return meta.downtimeMs
      ? t('serverUpAfter', { name, duration: formatDuration(meta.downtimeMs, locale) })
      : t('serverUp', { name });
  }
  return m.content;
}

/** "Survival is down" / "back up" notices from Magnox itself. */
export const SystemMessage = React.memo(function SystemMessage({
  message: m,
  highlighted,
  tabIndex,
  onFocus,
}: {
  message: ChatMessage;
  highlighted: boolean;
  tabIndex: number;
  onFocus: (id: string) => void;
}) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const { prefs } = useChat();
  const down = m.kind === 'server_down';
  const serverId = (m.meta as Partial<ServerAlertMeta> | null)?.serverId;
  const headerId = `msg-${m.id}-h`;
  const Icon = down ? ServerCrash : ServerCog;
  return (
    // A quiet line with a coloured icon where an avatar would be, as Discord shows its notices.
    <article
      id={`msg-${m.id}`}
      data-message-id={m.id}
      data-kind={m.kind}
      tabIndex={tabIndex}
      onFocus={(e) => e.target === e.currentTarget && onFocus(m.id)}
      aria-labelledby={headerId}
      className={cn(
        'mt-1 flex scroll-mt-16 scroll-mb-16 items-start gap-4 px-4 py-1 outline-none hover:bg-fg/[0.035] focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        highlighted && 'bg-primary/10 ring-2 ring-primary ring-inset',
      )}
    >
      <span className="flex w-10 shrink-0 justify-center pt-0.5">
        <Icon className={cn('size-5', down ? 'text-danger' : 'text-success')} aria-hidden />
      </span>
      <p id={headerId} className="min-w-0 flex-1 text-[0.9375rem] text-muted">
        <span className="sr-only">{t('systemNotice')}: </span>
        <span className="font-medium text-fg">{systemText(m, t, locale)}</span>{' '}
        <time
          dateTime={m.createdAt}
          title={fullDateTime(m.createdAt, prefs.timeFormat, locale)}
          className="ms-1 text-xs"
        >
          {formatTime(m.createdAt, prefs.timeFormat, locale)}
        </time>
        {serverId && (
          <>
            {' · '}
            <Link
              href={`/servers/${serverId}`}
              tabIndex={tabIndex === 0 ? 0 : -1}
              className="text-xs font-semibold underline-offset-2 hover:text-fg hover:underline"
            >
              {t('viewServer')}
            </Link>
          </>
        )}
      </p>
    </article>
  );
});
