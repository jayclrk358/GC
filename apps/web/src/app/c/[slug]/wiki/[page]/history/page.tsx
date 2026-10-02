import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { canEditWiki, wikiHistory } from '@magnox/core';
import { formatDateTime, relativeTime } from '@/lib/format';
import { Badge } from '@/components/ui/misc';
import { RestoreRevisionButton } from '@/components/wiki/wiki-page-tools';
import { loadWikiPage } from '../../_load';
import { BackLink } from '@/components/ui/back-link';

type Params = Promise<{ slug: string; page: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, page } = await params;
  return { title: `History of ${(await loadWikiPage(slug, page)).page.title}` };
}

export default async function WikiHistoryPage({ params }: { params: Params }) {
  const { slug, page: pageSlug } = await params;
  const { data, page } = await loadWikiPage(slug, pageSlug);
  const t = await getTranslations('wiki');
  const tBack = await getTranslations('common');
  const locale = await getLocale();
  const revisions = await wikiHistory(data.ctx, page.id);
  const canEdit = canEditWiki(data.ctx, page);
  const pageHref = `/c/${slug}/wiki/${page.slug}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <BackLink href={pageHref}>{tBack('backTo', { name: page.title })}</BackLink>
        <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
          <Link href={pageHref} className="hover:underline">
            {page.title}
          </Link>{' '}
          › {t('history')}
        </nav>
      </div>
      <h2 className="text-2xl font-bold">{t('historyOf', { title: page.title })}</h2>
      <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('revisions')}</caption>
          <thead className="border-b border-border text-start text-muted">
            <tr>
              <th scope="col" className="p-3 text-start font-semibold">
                {t('when')}
              </th>
              <th scope="col" className="p-3 text-start font-semibold">
                {t('author')}
              </th>
              <th scope="col" className="p-3 text-start font-semibold">
                {t('summary')}
              </th>
              <th scope="col" className="p-3 text-end font-semibold">
                {t('size')}
              </th>
              <th scope="col" className="p-3 text-end font-semibold">
                <span className="sr-only">{t('actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {revisions.map((r) => {
              const current = r.id === page.currentRevisionId;
              const when = formatDateTime(r.createdAt, 'auto', locale);
              return (
                <tr key={r.id}>
                  <td className="p-3 whitespace-nowrap">
                    <Link
                      href={`${pageHref}/history/${r.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      <time dateTime={r.createdAt.toISOString()}>{when}</time>
                    </Link>
                    <span className="block text-xs text-muted">
                      {relativeTime(r.createdAt, undefined, locale)}
                    </span>
                  </td>
                  <td className="p-3">
                    {r.authorUsername ? (
                      <Link href={`/u/${r.authorUsername}`} className="hover:underline">
                        {r.authorName}
                      </Link>
                    ) : (
                      (r.authorName ?? t('someone'))
                    )}
                  </td>
                  <td className="p-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {r.summary || <span className="text-muted">{t('noSummary')}</span>}
                      {current && <Badge tone="primary">{t('current')}</Badge>}
                      {r.restoredFromId && <Badge>{t('restoredBadge')}</Badge>}
                    </span>
                  </td>
                  <td className="p-3 text-end text-muted tabular-nums">
                    {t('chars', { count: Number(r.size) })}
                  </td>
                  <td className="p-3 text-end">
                    {canEdit && !current && (
                      <RestoreRevisionButton
                        communityId={data.community.id}
                        pageId={page.id}
                        revisionId={r.id}
                        pageHref={pageHref}
                        label={t('restoreFrom', { date: when })}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
