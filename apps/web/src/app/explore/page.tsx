import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Compass, Gem } from 'lucide-react';
import { exploreCommunities, featuredCommunities, listGames } from '@magnox/core';
import { LANGUAGES, REGIONS } from '@magnox/shared';
import { CommunityCard } from '@/components/community/community-card';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { ExploreFilters } from '@/components/community/explore-filters';
import { AutoRefresh } from '@/components/live/live';
import { pageParam } from '@/lib/page-param';

export const metadata = { title: 'Explore communities' };

type SP = {
  q?: string;
  game?: string;
  tag?: string;
  region?: string;
  language?: string;
  sort?: string;
  page?: string;
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = await getTranslations('explore');
  const page = pageParam(sp.page);
  const sort = (['popular', 'new', 'relevance'] as const).find((s) => s === sp.sort);
  // Featured (Pro) communities lead the first page when nothing is being searched or filtered.
  const browsing = page === 0 && !sp.q && !sp.game && !sp.tag && !sp.region && !sp.language;
  const [result, games, featured] = await Promise.all([
    exploreCommunities({
      q: sp.q,
      game: sp.game || undefined,
      tag: sp.tag || undefined,
      region: (REGIONS as readonly string[]).includes(sp.region ?? '') ? sp.region : undefined,
      language: (LANGUAGES as readonly string[]).includes(sp.language ?? '')
        ? sp.language
        : undefined,
      sort,
      page,
    }),
    listGames(),
    browsing ? featuredCommunities(3) : Promise.resolve([]),
  ]);
  const pages = Math.ceil(result.total / result.pageSize);
  const link = (p: number) =>
    `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), page: String(p) })}`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <AutoRefresh every={300} away={120} />
      <PageHeader title={t('title')} description={t('description')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <ExploreFilters games={games} values={sp} />
        <div className="flex min-w-0 flex-col gap-4">
          {featured.length > 0 && (
            <section aria-labelledby="featured-h" className="flex flex-col gap-3">
              <h2 id="featured-h" className="flex items-center gap-2 text-lg font-bold">
                <Gem aria-hidden className="size-5 text-primary" />
                {t('featured')}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featured.map((c) => (
                  <li key={c.id}>
                    <CommunityCard c={c} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p role="status" className="text-sm text-muted">
            {t('results', { count: result.total })}
          </p>
          {result.items.length === 0 ? (
            <EmptyState
              icon={<Compass />}
              title={t('noResults')}
              description={t('noResultsBody')}
            />
          ) : (
            <ul className="mx-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((c) => (
                <li key={c.id}>
                  <CommunityCard c={c} />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <nav aria-label={t('pagination')} className="flex items-center justify-between">
              {page > 0 ? (
                <Link href={link(page - 1)} className="font-semibold text-primary underline">
                  {t('previous')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted">{t('pageOf', { page: page + 1, pages })}</span>
              {page + 1 < pages ? (
                <Link href={link(page + 1)} className="font-semibold text-primary underline">
                  {t('next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
