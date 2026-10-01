import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { platformReports } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Badge, PageHeader } from '@/components/ui/misc';

export const metadata = { title: 'Reports' };

export default async function AdminReportsPage() {
  const user = await getUser();
  const [t, tr, rows] = await Promise.all([
    getTranslations('admin'),
    getTranslations('reports'),
    platformReports(user?.id ?? null),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('reportsTitle')} description={t('reportsDescription')} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('noReports')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <article
                aria-labelledby={`r-${r.id}`}
                className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-4 text-sm"
              >
                <header className="flex flex-wrap items-center gap-2">
                  <h2 id={`r-${r.id}`} className="font-bold">
                    {tr(`reasons.${r.reason}`)}
                  </h2>
                  <Badge>{tr(`targets.${r.targetType}`)}</Badge>
                  <span className="text-muted" suppressHydrationWarning>
                    {formatDateTime(r.createdAt)}
                  </span>
                </header>
                <p>
                  <Link
                    href={`/admin/communities/${r.communityId}`}
                    className="font-semibold hover:underline"
                  >
                    {r.communityName}
                  </Link>
                  {r.targetUserId && (
                    <>
                      {' · '}
                      <Link href={`/admin/users/${r.targetUserId}`} className="hover:underline">
                        {r.targetName ?? t('someone')}
                      </Link>
                    </>
                  )}
                </p>
                {r.details && <p className="whitespace-pre-line">{r.details}</p>}
                {r.excerpt && (
                  <blockquote className="rounded-ui border-s-4 border-border bg-surface-2 px-3 py-2 whitespace-pre-line">
                    {r.excerpt}
                  </blockquote>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
