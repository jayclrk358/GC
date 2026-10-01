import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { adminUser, isAppError } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { BackLink } from '@/components/ui/back-link';
import { Alert, PageHeader } from '@/components/ui/misc';
import { UserActions } from '@/components/admin/user-actions';

export const metadata = { title: 'Person' };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getUser();
  const t = await getTranslations('admin');
  let u;
  try {
    u = await adminUser(me?.id ?? null, decodeURIComponent(id));
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
              ? t('bannedUntil', { date: formatDateTime(u.banExpires) })
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
        <dd suppressHydrationWarning>{formatDateTime(u.createdAt)}</dd>
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
      {u.platformAdmin ? (
        <p className="text-sm text-muted">{t('isAdmin')}</p>
      ) : (
        <UserActions userId={u.id} banned={u.banned} />
      )}
    </div>
  );
}
