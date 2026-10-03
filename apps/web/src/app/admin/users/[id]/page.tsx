import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminUser, isAppError, staffCan } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { BackLink } from '@/components/ui/back-link';
import { Alert, Badge, PageHeader } from '@/components/ui/misc';
import { UserActions } from '@/components/admin/user-actions';
import { DeleteUser } from '@/components/admin/delete-user';
import { UserEdit } from '@/components/admin/user-edit';

export const metadata = { title: 'Person' };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await staffFor('users');
  const t = await getTranslations('admin');
  const locale = await getLocale();
  let u;
  try {
    u = await adminUser(viewer.id, decodeURIComponent(id));
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/users">{t('backToUsers')}</BackLink>
      <PageHeader
        title={u.name}
        description={u.username ? `@${u.username}` : undefined}
        actions={
          u.username ? (
            <Link href={`/u/${u.username}`} className="font-semibold text-primary hover:underline">
              {t('profile')}
            </Link>
          ) : null
        }
      />
      {u.banned && (
        <Alert
          tone="danger"
          title={
            u.banExpires
              ? t('bannedUntil', { date: formatDateTime(u.banExpires, 'auto', locale) })
              : t('bannedForever')
          }
        >
          {u.banReason}
        </Alert>
      )}
      <dl className="grid gap-x-6 gap-y-2 rounded-ui-lg border border-border bg-surface p-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted">{t('col.email')}</dt>
        <dd>
          {u.email} {u.emailVerified ? '' : `(${t('unverified')})`}
        </dd>
        <dt className="text-muted">{t('col.joined')}</dt>
        <dd suppressHydrationWarning>{formatDateTime(u.createdAt, 'auto', locale)}</dd>
        <dt className="text-muted">{t('memberOf')}</dt>
        <dd>{t('communitiesCount', { count: u.memberships })}</dd>
        <dt className="text-muted">{t('owns')}</dt>
        <dd>
          {u.owned.length === 0
            ? t('none')
            : u.owned.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <Link href={`/admin/communities/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </span>
              ))}
        </dd>
        <dt className="text-muted">{t('signedIn')}</dt>
        <dd>{t('sessionsCount', { count: u.sessions })}</dd>
        <dt className="text-muted">{t('reported')}</dt>
        <dd>{t('timesCount', { count: u.timesReported })}</dd>
      </dl>
      {u.staffRole && (
        <p className="text-sm">
          <Badge tone="primary">{t(`roles.${u.staffRole}`)}</Badge>
        </p>
      )}
      {u.manageable ? (
        <>
          <UserEdit
            userId={u.id}
            name={u.name}
            username={u.username}
            emailVerified={u.emailVerified}
          />
          <UserActions userId={u.id} banned={u.banned} />
          {staffCan(viewer.role, 'suspend') && (
            <DeleteUser userId={u.id} handle={u.username ?? u.email} />
          )}
        </>
      ) : (
        <p className="text-sm text-muted">{t('cannotManage')}</p>
      )}
    </div>
  );
}
