import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Hash, Megaphone, MessagesSquare, Settings } from 'lucide-react';
import { forumChannelStats, listVisibleChannels } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { relativeTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { ForumSearch } from '@/components/forum/forum-search';

export const metadata = { title: 'Forum' };

export default async function ForumIndex({ params }: { params: Promise<{ slug: string }> }) {
  const data = await loadCommunity((await params).slug);
  const t = await getTranslations('forum');
  const { tree, channels } = await listVisibleChannels(data.ctx, { types: ['forum', 'announcement'] });
  const stats = await forumChannelStats(channels.map((c) => c.id));
  const base = `/c/${data.community.slug}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ForumSearch slug={data.community.slug} />
          {data.perms.manageChannels && (
            <Button asChild variant="outline">
              <Link href={`${base}/settings/channels`}>
                <Settings aria-hidden /> {t('manageChannels')}
              </Link>
            </Button>
          )}
        </div>
      </div>
      {channels.length === 0 ? (
        <EmptyState icon={<MessagesSquare />} title={t('noChannels')} description={data.perms.manageChannels ? t('noChannelsManage') : undefined} />
      ) : (
        tree.categories.map((cat) => (
          <section key={cat.id ?? 'none'} aria-labelledby={`cat-${cat.id ?? 'none'}`}>
            <h3 id={`cat-${cat.id ?? 'none'}`} className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">
              {cat.name || t('uncategorised')}
            </h3>
            <ul className="divide-y divide-border rounded-ui-lg border border-border bg-surface">
              {cat.channels.map((c) => {
                const s = stats.get(c.id);
                const Icon = c.type === 'announcement' ? Megaphone : Hash;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-4 p-4">
                    <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <Link href={`${base}/forum/${c.name}`} className="font-bold hover:underline">
                        {c.name}
                      </Link>
                      {c.topic && <p className="text-sm text-muted">{c.topic}</p>}
                    </div>
                    <p className="w-28 text-sm text-muted tabular-nums">{t('threadCount', { count: s?.threads ?? 0 })}</p>
                    <div className="w-64 min-w-0 text-sm">
                      {s?.latest ? (
                        <>
                          <Link href={`${base}/t/${s.latest.id}`} className="block truncate font-medium hover:underline">
                            {s.latest.title}
                          </Link>
                          <span className="text-muted">{relativeTime(s.latest.lastActivityAt)}</span>
                        </>
                      ) : (
                        <span className="text-muted">{t('noThreadsYet')}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
