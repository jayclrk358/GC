import Link from '@/components/ui/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminCommunities } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { Badge, PageHeader } from '@/components/ui/misc';
import { AdminSearch } from '@/components/admin/search-form';

export const metadata = { title: 'Communities' };

export default async function AdminCommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
  const staff = await staffFor('communities');
  const [t, locale, rows] = await Promise.all([
    getTranslations('admin'),
    getLocale(),
    adminCommunities(staff.id, q),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('communitiesTitle')} />
      <AdminSearch label={t('findCommunity')} button={t('search')} defaultValue={q} />
      <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('communitiesTitle')}</caption>
          <thead>
            <tr className="border-b border-border text-start">
              <th scope="col" className="p-3 text-start">
                {t('col.community')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('col.owner')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('col.plan')}
              </th>
              <th scope="col" className="p-3 text-end">
                {t('col.members')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('col.created')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <th scope="row" className="p-3 text-start font-semibold">
                  <Link href={`/admin/communities/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                  <span className="block text-xs font-normal text-muted">/c/{c.slug}</span>
                  {c.suspendedAt && <Badge className="mt-1">{t('suspended')}</Badge>}
                  {c.archivedAt && <Badge className="mt-1">{t('archived')}</Badge>}
                </th>
                <td className="p-3">{c.ownerName ?? '—'}</td>
                <td className="p-3">
                  {t(`plans.${c.plan}`)}
                  {c.giftPlan && (
                    <span className="block text-xs text-muted">{t('giftedShort')}</span>
                  )}
                </td>
                <td className="p-3 text-end tabular-nums">{c.memberCount}</td>
                <td className="p-3 whitespace-nowrap" suppressHydrationWarning>
                  {formatDateTime(c.createdAt, 'auto', locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-muted">{t('noResults')}</p>}
      </div>
    </div>
  );
}
