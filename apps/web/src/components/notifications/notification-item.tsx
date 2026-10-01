'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AtSign,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Flag,
  Gavel,
  Info,
  MessageSquare,
  Reply,
  Shield,
} from 'lucide-react';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface NotificationData {
  id: string;
  type: string;
  url: string;
  data: { title?: string; excerpt?: string; community?: string };
  readAt: string | Date | null;
  createdAt: string | Date;
  actorName: string | null;
  actorImage?: string | null;
}

const ICONS: Record<
  string,
  React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
> = {
  reply: Reply,
  mention: AtSign,
  thread_reply: MessageSquare,
  solution: CheckCircle2,
  wiki_edit: BookOpen,
  report: Flag,
  moderation: Gavel,
  role: Shield,
  event: CalendarDays,
  application: ClipboardList,
  system: Info,
};

const KNOWN = new Set(Object.keys(ICONS));

/** One notification as a link; the unread state is conveyed in text as well as the dot. */
export function NotificationItem({
  n,
  onOpen,
  compact,
}: {
  n: NotificationData;
  onOpen?: (n: NotificationData) => void;
  compact?: boolean;
}) {
  const t = useTranslations('notifications');
  const Icon = ICONS[n.type] ?? Info;
  const unread = !n.readAt;
  const type = KNOWN.has(n.type) ? n.type : 'system';
  const headline = t(`types.${type}` as 'types.system', {
    actor: n.actorName ?? t('someone'),
    title: n.data.title ?? '',
  });
  return (
    <Link
      href={n.url}
      onClick={() => onOpen?.(n)}
      className={cn(
        'flex gap-3 rounded-ui-sm p-3 text-sm hover:bg-surface-2 focus-visible:bg-surface-2',
        unread && 'bg-primary/5',
      )}
    >
      <span className="relative mt-0.5 shrink-0">
        <Icon className="size-5 text-muted" aria-hidden />
        {unread && (
          <span
            aria-hidden
            className="absolute -end-1 -top-1 size-2.5 rounded-full bg-primary ring-2 ring-surface"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        {unread && <span className="sr-only">{t('unreadPrefix')} </span>}
        <span className={cn('block', unread && 'font-semibold')}>{headline}</span>
        {n.data.excerpt && (
          <span className={cn('block text-muted', compact ? 'line-clamp-1' : 'line-clamp-2')}>
            {n.data.excerpt}
          </span>
        )}
        <span className="mt-0.5 block text-xs text-muted">
          {n.data.community && <>{n.data.community} · </>}
          <time dateTime={new Date(n.createdAt).toISOString()}>{relativeTime(n.createdAt)}</time>
        </span>
      </span>
    </Link>
  );
}
