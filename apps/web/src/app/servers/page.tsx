import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Server, X } from 'lucide-react';
import { browserGames, markEndpointsHot, searchServers } from '@magnox/core';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { ServerCard } from '@/components/servers/server-status';
import { ServerFilters } from '@/components/servers/server-filters';
import { AutoRefresh } from '@/components/live/live';

export const metadata = { title: 'Server browser' };

type SP = Record<string, string | undefined>;

export default async function ServersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = await getTranslations('servers');
  const [result, games] = await Promise.all([searchServers(sp), browserGames()]);
  await markEndpointsHot(result.items.map((s) => s.endpointId));
  const pages = Math.ceil(result.total / result.pageSize);
  const query = (patch: SP) => {
    const next = { ...sp, ...patch };
    const params = new URLSearchParams(
      Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `?${params}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <AutoRefresh every={30} away={30} />
      <PageHeader title={t('browserTitle')} description={t('browserDescription')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <ServerFilters games={games} values={sp} />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="text-sm text-muted">
              {t('results', { count: result.total })}
            </p>
            {result.filters.tag && (
              <Link
                href={query({ tag: undefined, page: undefined })}
                className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium hover:border-primary"
              >
                #{result.filters.tag}
                <X className="size-3.5" aria-hidden />
                <span className="sr-only">{t('removeTag')}</span>
              </Link>
            )}
          </div>
          {result.items.length === 0 ? (
            <EmptyState
              icon={<Server />}
              title={
                result.total === 0 && Object.keys(sp).length ? t('noMatches') : t('browserEmpty')
              }
              description={Object.keys(sp).length ? t('noMatchesBody') : undefined}
            />
          ) : (
            <ul className="mx-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((s) => (
                <li key={s.id}>
                  <ServerCard
                    server={s}
                    href={`/servers/${s.id}`}
                    community={s.community}
                    votes={s.voteCount}
                    tagHrefs={Object.fromEntries(
                      s.tags.map((tag) => [tag, query({ tag, page: undefined })]),
                    )}
                  />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <nav aria-label={t('pagination')} className="flex items-center justify-between">
              {result.page > 0 ? (
                <Link
                  href={query({ page: String(result.page - 1) })}
                  className="font-semibold text-primary underline"
                >
                  {t('previous')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted">
                {t('pageOf', { page: result.page + 1, pages })}
              </span>
              {result.page + 1 < pages ? (
                <Link
                  href={query({ page: String(result.page + 1) })}
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
      </div>
    </div>
  );
}
