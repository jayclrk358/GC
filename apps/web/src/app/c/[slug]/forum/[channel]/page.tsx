import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Hash, Megaphone, PenSquare } from 'lucide-react';
import { isMuted, listFlairs, listThreads } from '@magnox/core';
import { has, Permission, THREAD_SORTS, type ThreadSort } from '@magnox/shared';
import { loadCommunity, loadForumChannel } from '@/lib/community';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { ThreadList } from '@/components/forum/thread-list';
import { ChannelLiveBanner } from '@/components/forum/live-banners';
import { MuteMenu } from '@/components/notifications/mute-menu';
import { cn } from '@/lib/utils';

export async function generateMetadata({ params }: { params: Promise<{ channel: string }> }) {
  return { title: `#${(await params).channel}` };
}

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; channel: string }>;
  searchParams: Promise<{ sort?: string; flair?: string; page?: string }>;
}) {
  const { slug, channel: channelName } = await params;
  const sp = await searchParams;
  const data = await loadCommunity(slug);
  const t = await getTranslations('forum');
  const channel = await loadForumChannel(data.ctx, channelName);
  const perms = BigInt(channel.perms);
  const sort = (THREAD_SORTS as readonly string[]).includes(sp.sort ?? '')
    ? (sp.sort as ThreadSort)
    : undefined;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const [list, flairs, muted] = await Promise.all([
    listThreads(data.ctx, channel, { sort, flairId: sp.flair, page }),
    listFlairs(data.community.id, channel.id),
    data.user && data.ctx.isMember ? isMuted(data.user.id, 'channel', channel.id) : false,
  ]);
  const activeSort = sort ?? channel.settings.defaultSort ?? 'latest';
  const base = `/c/${slug}/forum/${channel.name}`;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(
      Object.entries({ sort: sp.sort, flair: sp.flair, ...patch }).filter(([, v]) => v) as [
        string,
        string,
      ][],
    );
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const sorts = THREAD_SORTS.filter((s) => s !== 'unanswered' || channel.settings.qa);
  const canPost =
    has(perms, Permission.CREATE_THREADS) &&
    (channel.type !== 'announcement' || has(perms, Permission.MANAGE_THREADS));
  const pages = Math.ceil(list.total / list.pageSize);
  const Icon = channel.type === 'announcement' ? Megaphone : Hash;

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
        <Link href={`/c/${slug}/forum`} className="hover:underline">
          {t('title')}
        </Link>{' '}
        › {channel.name}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Icon className="size-6 text-muted" aria-hidden />
            {channel.name}
          </h2>
          {channel.topic && <p className="mt-1 text-muted">{channel.topic}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.user && data.ctx.isMember && (
            <MuteMenu
              targetType="channel"
              targetId={channel.id}
              name={`#${channel.name}`}
              muted={muted}
            />
          )}
          {canPost && (
            <Button asChild>
              <Link href={`${base}/new`}>
                <PenSquare aria-hidden /> {t('newThread')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t('sortBy')}>
          <ul className="flex flex-wrap gap-1 rounded-ui bg-surface-2 p-1">
            {sorts.map((s) => (
              <li key={s}>
                <Link
                  href={qs({ sort: s, page: undefined })}
                  aria-current={s === activeSort ? 'true' : undefined}
                  className="block rounded-ui-sm px-3 py-1.5 text-sm font-semibold text-muted aria-[current=true]:bg-surface aria-[current=true]:text-fg aria-[current=true]:shadow-sm"
                >
                  {t(`sorts.${s}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {flairs.length > 0 && (
          <nav aria-label={t('filterByFlair')}>
            <ul className="flex flex-wrap gap-1">
              <li>
                <Link
                  href={qs({ flair: undefined, page: undefined })}
                  aria-current={!sp.flair ? 'true' : undefined}
                  className="block rounded-full border border-border px-3 py-1 text-sm aria-[current=true]:border-primary aria-[current=true]:font-semibold"
                >
                  {t('allFlairs')}
                </Link>
              </li>
              {flairs.map((f) => (
                <li key={f.id}>
                  <Link
                    href={qs({ flair: f.id, page: undefined })}
                    aria-current={sp.flair === f.id ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm aria-[current=true]:border-primary aria-[current=true]:font-semibold',
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: f.color ?? 'var(--c-text-muted)' }}
                    />
                    {f.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <ChannelLiveBanner channelId={channel.id} />

      {list.items.length === 0 ? (
        <EmptyState title={t('empty')} description={canPost ? t('emptyPost') : undefined} />
      ) : (
        <ThreadList
          communityId={data.community.id}
          slug={slug}
          threads={list.items}
          voting={Boolean(channel.settings.voting) && has(perms, Permission.VOTE)}
          qa={Boolean(channel.settings.qa)}
          signedIn={Boolean(data.user)}
        />
      )}

      {pages > 1 && (
        <nav aria-label={t('pagination')} className="flex items-center justify-between">
          {page > 0 ? (
            <Link
              href={qs({ page: String(page - 1) })}
              className="font-semibold text-primary underline"
            >
              {t('previous')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">{t('pageOf', { page: page + 1, pages })}</span>
          {page + 1 < pages ? (
            <Link
              href={qs({ page: String(page + 1) })}
              className="font-semibold text-primary underline"
            >
              {t('next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
