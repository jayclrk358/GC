import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminLog } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/misc';

export const metadata = { title: 'Log' };

type LogRow = Awaited<ReturnType<typeof adminLog>>[number];

/** Where an entry's target can be looked at. Removed posts are gone, so their author instead. */
function targetLink(
  r: LogRow,
): { href: string; label: 'viewUser' | 'viewCommunity' | 'viewFeedback' | 'viewAuthor' } | null {
  switch (r.targetType) {
    case 'user':
      return { href: `/admin/users/${r.targetId}`, label: 'viewUser' };
    case 'community':
      return { href: `/admin/communities/${r.targetId}`, label: 'viewCommunity' };
    case 'feedback':
      return { href: `/admin/feedback/${r.targetId}`, label: 'viewFeedback' };
    default:
      return typeof r.details.authorId === 'string'
        ? { href: `/admin/users/${r.details.authorId}`, label: 'viewAuthor' }
        : null;
  }
}

export default async function AdminLogPage() {
  const staff = await staffFor('log');
  const [t, locale, rows] = await Promise.all([
    getTranslations('admin'),
    getLocale(),
    adminLog(staff.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('logTitle')} description={t('logDescription')} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('noLog')}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-ui-lg border border-border bg-surface text-sm">
          {rows.map((r) => {
            const link = targetLink(r);
            return (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
                <span className="font-semibold">{r.adminName ?? t('someone')}</span>
                <span>{r.action}</span>
                {link && (
                  <Link href={link.href} className="text-primary hover:underline">
                    {t(link.label)}
                  </Link>
                )}
                {typeof r.details.reason === 'string' && (
                  <span className="text-muted">“{r.details.reason}”</span>
                )}
                <span className="ms-auto text-muted" suppressHydrationWarning>
                  {formatDateTime(r.createdAt, 'auto', locale)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
