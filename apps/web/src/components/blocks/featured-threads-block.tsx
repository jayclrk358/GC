import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { MessageSquare } from 'lucide-react';
import { recentThreads } from '@magnox/core';
import type { BlockConfig } from '@magnox/shared';
import type { LoadedCommunity } from '@/lib/community';
import { relativeTime } from '@/lib/format';
import { BlockSection } from './section';

/** The most recently active threads the viewer can see. */
export async function FeaturedThreadsBlock({
  id,
  config,
  data,
}: {
  id: string;
  config: BlockConfig<'featuredThreads'>;
  data: LoadedCommunity;
}) {
  const t = await getTranslations('forum');
  const locale = await getLocale();
  const threads = await recentThreads(data.ctx, {
    channelId: config.channelId,
    count: config.count,
  });
  const base = `/c/${data.community.slug}`;
  if (!threads.length && !data.perms.manage) return null;
  return (
    <BlockSection id={id} heading={config.heading}>
      {threads.length === 0 ? (
        <p className="rounded-ui border border-dashed border-border p-4 text-muted">
          {t('noThreadsYet')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-ui-lg border border-border bg-surface">
          {threads.map((th) => (
            <li key={th.id} className="flex items-center gap-3 p-4">
              <MessageSquare className="size-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={`${base}/t/${th.id}`} className="font-semibold hover:underline">
                  {th.title}
                </Link>
                <p className="text-sm text-muted">
                  #{th.channelName}
                  {th.authorName && <> · {th.authorName}</>} ·{' '}
                  {t('lastActivity', { when: relativeTime(th.lastActivityAt, undefined, locale) })}
                </p>
              </div>
              <span className="text-sm text-muted tabular-nums">
                {t('replies', { count: th.replyCount })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href={`${base}/forum`} className="font-semibold text-primary underline">
          {t('goToForum')}
        </Link>
      </p>
    </BlockSection>
  );
}
