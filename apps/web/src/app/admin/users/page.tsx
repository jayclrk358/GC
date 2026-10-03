import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminUsers } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { Badge, PageHeader } from '@/components/ui/misc';
import { AdminSearch } from '@/components/admin/search-form';

export const metadata = { title: 'People' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
  const staff = await staffFor('users');
  const [t, locale, rows] = await Promise.all([
    getTranslations('admin'),
    getLocale(),
    adminUsers(staff.id, q),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('usersTitle')} />
      <AdminSearch label={t('findUser')} button={t('search')} defaultValue={q} />
      <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('usersTitle')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-3 text-start">
                {t('col.person')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('col.email')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('col.joined')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <th scope="row" className="p-3 text-start font-semibold">
                  <Link href={`/admin/users/${u.id}`} className="hover:underline">
                    {u.name}
                  </Link>
                  {u.username && (
                    <span className="block text-xs font-normal text-muted">@{u.username}</span>
                  )}
                  {u.banned && <Badge className="mt-1">{t('banned')}</Badge>}
                  {(u.role === 'admin' || u.role === 'moderator') && (
                    <Badge className="mt-1">{t(`roles.${u.role}`)}</Badge>
                  )}
                </th>
                <td className="p-3">
                  {u.email}
                  {!u.emailVerified && (
                    <span className="block text-xs text-muted">{t('unverified')}</span>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap" suppressHydrationWarning>
                  {formatDateTime(u.createdAt, 'auto', locale)}
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
