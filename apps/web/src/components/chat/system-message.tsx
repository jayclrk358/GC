'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ServerCrash, ServerCog } from 'lucide-react';
import { formatDuration, type ServerAlertMeta } from '@magnox/shared';
import { cn } from '@/lib/utils';
import { useChat } from './chat-context';
import { formatTime, fullDateTime } from './format';
import type { ChatMessage } from './types';

type T = ReturnType<typeof useTranslations<'chat'>>;

/** The notice in the reader's language, from its structured details. */
export function systemText(m: Pick<ChatMessage, 'kind' | 'meta' | 'content'>, t: T): string {
  const meta = (m.meta ?? {}) as Partial<ServerAlertMeta>;
  const name = meta.serverName ?? '';
  if (m.kind === 'server_down') return t('serverDown', { name });
  if (m.kind === 'server_up') {
    return meta.downtimeMs
      ? t('serverUpAfter', { name, duration: formatDuration(meta.downtimeMs) })
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
  const { prefs } = useChat();
  const down = m.kind === 'server_down';
  const serverId = (m.meta as Partial<ServerAlertMeta> | null)?.serverId;
  const headerId = `msg-${m.id}-h`;
  const Icon = down ? ServerCrash : ServerCog;
  return (
    <article
      id={`msg-${m.id}`}
      data-message-id={m.id}
      data-kind={m.kind}
      tabIndex={tabIndex}
      onFocus={(e) => e.target === e.currentTarget && onFocus(m.id)}
      aria-labelledby={headerId}
      className={cn(
        'mx-4 mt-2 flex scroll-mt-16 scroll-mb-16 items-start gap-3 rounded-ui border-s-4 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-primary',
        down ? 'border-danger bg-danger/10' : 'border-success bg-success/10',
        highlighted && 'ring-2 ring-primary',
      )}
    >
      <Icon
        className={cn('mt-0.5 size-5 shrink-0', down ? 'text-danger' : 'text-success')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p id={headerId} className="text-sm">
          <span className="sr-only">{t('systemNotice')}: </span>
          <span className="font-semibold">{systemText(m, t)}</span>{' '}
          <time
            dateTime={m.createdAt}
            title={fullDateTime(m.createdAt, prefs.timeFormat)}
            className="text-xs text-muted"
          >
            {formatTime(m.createdAt, prefs.timeFormat)}
          </time>
        </p>
        {serverId && (
          <Link
            href={`/servers/${serverId}`}
            tabIndex={tabIndex === 0 ? 0 : -1}
            className="text-xs font-semibold text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            {t('viewServer')}
          </Link>
        )}
      </div>
    </article>
  );
});
