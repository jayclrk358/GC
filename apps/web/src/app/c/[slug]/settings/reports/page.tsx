import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Flag } from 'lucide-react';
import { listReports } from '@magnox/core';
import { has, Permission } from '@magnox/shared';
import { loadCommunityForSettings } from '@/lib/community';
import { formatDateTime, relativeTime } from '@/lib/format';
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { ReportActions } from '@/components/moderation/report-actions';

export const metadata = { title: 'Reports' };

const STATUSES = ['open', 'resolved', 'dismissed'] as const;

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { slug } = await params;
  const { community, perms, ctx } = await loadCommunityForSettings(slug);
  if (!perms.manageReports) notFound();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as (typeof STATUSES)[number])
    : 'open';
  const t = await getTranslations('reports');
  const locale = await getLocale();
  const reports = await listReports(ctx, status);
  const canDelete =
    has(ctx.base, Permission.MANAGE_MESSAGES) || has(ctx.base, Permission.MANAGE_THREADS);
  const base = `/c/${slug}/settings/reports`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <nav aria-label={t('filter')}>
        <ul className="flex gap-1 rounded-ui bg-surface-2 p-1">
          {STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={s === 'open' ? base : `${base}?status=${s}`}
                aria-current={s === status ? 'page' : undefined}
                className="block rounded-ui-sm px-3 py-1.5 text-sm font-semibold text-muted aria-[current=page]:bg-surface aria-[current=page]:text-fg aria-[current=page]:shadow-sm"
              >
                {t(`statuses.${s}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {reports.length === 0 ? (
        <EmptyState icon={<Flag />} title={status === 'open' ? t('emptyOpen') : t('empty')} />
      ) : (
        <ol className="flex flex-col gap-4">
          {reports.map((r) => {
            const context =
              r.targetType === 'post' && r.threadId
                ? `/c/${community.slug}/t/${r.threadId}/p/${r.targetId}`
                : r.targetType === 'thread'
                  ? `/c/${community.slug}/t/${r.targetId}`
                  : r.targetType === 'message'
                    ? `/c/${community.slug}/m/${r.targetId}`
                    : null;
            return (
              <li key={r.id}>
                <article
                  aria-labelledby={`report-${r.id}`}
                  className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-4"
                >
                  <header className="flex flex-wrap items-center gap-2">
                    <h2 id={`report-${r.id}`} className="font-bold">
                      {t(`reasons.${r.reason}`)}
                    </h2>
                    <Badge>{t(`targets.${r.targetType}`)}</Badge>
                    <span className="text-sm text-muted">
                      <time
                        dateTime={r.createdAt.toISOString()}
                        title={formatDateTime(r.createdAt, 'auto', locale)}
                      >
                        {relativeTime(r.createdAt, undefined, locale)}
                      </time>
                    </span>
                  </header>
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
                    <dt className="text-muted">{t('reportedUser')}</dt>
                    <dd>{r.targetUser ?? t('unknown')}</dd>
                    <dt className="text-muted">{t('reporter')}</dt>
                    <dd>{r.reporter ?? t('unknown')}</dd>
                    {r.details && (
                      <>
                        <dt className="text-muted">{t('details')}</dt>
                        <dd className="whitespace-pre-line">{r.details}</dd>
                      </>
                    )}
                    {r.status !== 'open' && (
                      <>
                        <dt className="text-muted">{t('handledBy')}</dt>
                        <dd>
                          {r.resolver ?? t('unknown')}
                          {r.resolvedAt && <> · {formatDateTime(r.resolvedAt, 'auto', locale)}</>}
                          {r.resolution && <span className="block text-muted">{r.resolution}</span>}
                        </dd>
                      </>
                    )}
                  </dl>
                  {r.excerpt && (
                    <blockquote className="rounded-ui border-s-4 border-border bg-surface-2 px-3 py-2 text-sm whitespace-pre-line">
                      <span className="sr-only">{t('reportedContent')}: </span>
                      {r.excerpt}
                    </blockquote>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {context ? (
                      <Link
                        href={context}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {t('viewInContext')}
                      </Link>
                    ) : (
                      <span />
                    )}
                    {r.status === 'open' && (
                      <ReportActions
                        communityId={community.id}
                        reportId={r.id}
                        deletable={
                          !canDelete
                            ? null
                            : r.targetType === 'post' && r.threadId
                              ? { type: 'post', id: r.targetId }
                              : r.targetType === 'message'
                                ? { type: 'message', id: r.targetId }
                                : null
                        }
                      />
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
