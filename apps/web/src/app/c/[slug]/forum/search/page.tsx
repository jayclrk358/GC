import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Search } from 'lucide-react';
import { searchForum } from '@gamecentral/core';
import { loadCommunity } from '@/lib/community';
import { relativeTime } from '@/lib/format';
import { EmptyState } from '@/components/ui/misc';
import { ForumSearch } from '@/components/forum/forum-search';
import { BackLink } from '@/components/ui/back-link';

export const metadata = { title: 'Search the forum' };

/** Search snippets mark matches with «» (see searchForum); render them as <mark>. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('«') ? (
          <mark key={i} className="rounded-sm bg-warning/25 px-0.5 text-fg">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default async function ForumSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const data = await loadCommunity((await params).slug);
  const { q = '' } = await searchParams;
  const t = await getTranslations('forum');
  const tBack = await getTranslations('common');
  const locale = await getLocale();
  const results = await searchForum(data.ctx, q);
  const base = `/c/${data.community.slug}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <BackLink href={`${base}/forum`}>{tBack('backTo', { name: t('title') })}</BackLink>
        <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
          <Link href={`${base}/forum`} className="hover:underline">
            {t('title')}
          </Link>{' '}
          › {t('search')}
        </nav>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-bold">{q ? t('resultsFor', { q }) : t('search')}</h2>
        <ForumSearch slug={data.community.slug} defaultValue={q} />
      </div>
      <p role="status" className="text-sm text-muted">
        {q.trim().length >= 2 ? t('resultCount', { count: results.length }) : t('searchHint')}
      </p>
      {q.trim().length >= 2 && results.length === 0 ? (
        <EmptyState icon={<Search />} title={t('noResults')} />
      ) : (
        <ol className="flex flex-col gap-3">
          {results.map((r) => (
            <li key={r.threadId} className="rounded-ui-lg border border-border bg-surface p-4">
              <Link
                href={`${base}/t/${r.threadId}#post-${r.postId}`}
                className="text-lg font-bold hover:underline"
              >
                {r.title}
              </Link>
              <p className="mt-1 text-sm text-muted">
                #{r.channelName} · {t('replies', { count: r.replyCount })} ·{' '}
                {relativeTime(r.lastActivityAt, undefined, locale)}
              </p>
              {r.snippet && (
                <p className="mt-2 text-sm">
                  <Snippet text={r.snippet} />
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
