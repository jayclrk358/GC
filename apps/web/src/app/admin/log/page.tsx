import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { adminLog } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/misc';

export const metadata = { title: 'Log' };

export default async function AdminLogPage() {
  const user = await getUser();
  const [t, rows] = await Promise.all([getTranslations('admin'), adminLog(user?.id ?? null)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('logTitle')} description={t('logDescription')} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('noLog')}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-ui-lg border border-border bg-surface text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
              <span className="font-semibold">{r.adminName ?? t('someone')}</span>
              <span>{r.action}</span>
              <Link
                href={`/admin/${r.targetType === 'user' ? 'users' : 'communities'}/${r.targetId}`}
                className="text-primary hover:underline"
              >
                {t(r.targetType === 'user' ? 'viewUser' : 'viewCommunity')}
              </Link>
              {typeof r.details.reason === 'string' && (
                <span className="text-muted">“{r.details.reason}”</span>
              )}
              <span className="ms-auto text-muted" suppressHydrationWarning>
                {formatDateTime(r.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
