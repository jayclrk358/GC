import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminCommunity, isAppError, staffCan } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { BackLink } from '@/components/ui/back-link';
import { Alert, PageHeader } from '@/components/ui/misc';
import { GiftPlanForm } from '@/components/admin/gift-plan-form';
import { SuspendCommunityForm } from '@/components/admin/suspend-form';

export const metadata = { title: 'Community' };

export default async function AdminCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await staffFor('communities');
  const t = await getTranslations('admin');
  const locale = await getLocale();
  let c;
  try {
    c = await adminCommunity(staff.id, id);
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/communities">{t('backToCommunities')}</BackLink>
      <PageHeader
        title={c.name}
        description={c.tagline || undefined}
        actions={
          <Link href={`/c/${c.slug}`} className="font-semibold text-primary hover:underline">
            {t('open')}
          </Link>
        }
      />
      {c.suspendedAt && (
        <Alert
          tone="danger"
          title={t('suspendedSince', { when: formatDateTime(c.suspendedAt, 'auto', locale) })}
        >
          {c.suspendReason}
        </Alert>
      )}
      <dl className="grid gap-x-6 gap-y-2 rounded-ui-lg border border-border bg-surface p-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted">{t('col.owner')}</dt>
        <dd>
          {c.ownerUsername ? (
            <Link href={`/admin/users/${c.ownerId}`} className="hover:underline">
              {c.ownerName} (@{c.ownerUsername})
            </Link>
          ) : (
            c.ownerName
          )}
        </dd>
        <dt className="text-muted">{t('col.plan')}</dt>
        <dd>{t(`plans.${c.plan}`)}</dd>
        <dt className="text-muted">{t('subscriptions')}</dt>
        <dd>
          {c.subscriptions.length
            ? c.subscriptions
                .map((s) => `${t(`plans.${s.plan}`)} (${s.interval}, ${s.status})`)
                .join(', ')
            : t('none')}
        </dd>
        <dt className="text-muted">{t('col.members')}</dt>
        <dd>{c.memberCount}</dd>
        <dt className="text-muted">{t('openReports')}</dt>
        <dd>{c.openReports}</dd>
        <dt className="text-muted">{t('col.created')}</dt>
        <dd suppressHydrationWarning>{formatDateTime(c.createdAt, 'auto', locale)}</dd>
      </dl>
      {staffCan(staff.role, 'plans') && (
        <GiftPlanForm
          communityId={c.id}
          gift={
            c.gift
              ? {
                  plan: c.gift.plan,
                  expiresAt: c.gift.expiresAt?.toISOString() ?? null,
                  note: c.gift.note,
                }
              : null
          }
        />
      )}
      {staffCan(staff.role, 'suspend') && (
        <SuspendCommunityForm communityId={c.id} suspended={Boolean(c.suspendedAt)} />
      )}
    </div>
  );
}
