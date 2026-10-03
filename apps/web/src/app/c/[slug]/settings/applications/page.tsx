import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ClipboardList, Pencil } from 'lucide-react';
import { listApplications } from '@gamecentral/core';
import { loadCommunityForSettings } from '@/lib/community';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { ReviewQueue } from '@/components/applications/review-queue';

export const metadata = { title: 'Applications' };

const STATUSES = ['pending', 'approved', 'rejected'] as const;

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { slug } = await params;
  const { community, perms, ctx } = await loadCommunityForSettings(slug);
  if (!perms.reviewApplications) notFound();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as (typeof STATUSES)[number])
    : 'pending';
  const t = await getTranslations('applications');
  const applications = await listApplications(ctx, status);
  const base = `/c/${slug}/settings/applications`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('queueTitle')}
        description={t('queueDescription')}
        actions={
          perms.manage ? (
            <Button asChild variant="outline">
              <Link href={`${base}/form`}>
                <Pencil aria-hidden /> {t('editForm')}
              </Link>
            </Button>
          ) : null
        }
      />
      {community.joinMode !== 'apply' && (
        <p className="rounded-ui border border-border bg-surface-2 px-4 py-3 text-sm">
          {t('modeOff')}{' '}
          {perms.manage && (
            <Link href={`/c/${slug}/settings`} className="font-semibold text-primary underline">
              {t('modeOffLink')}
            </Link>
          )}
        </p>
      )}
      <nav aria-label={t('filter')}>
        <ul className="flex gap-1 rounded-ui bg-surface-2 p-1">
          {STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={s === 'pending' ? base : `${base}?status=${s}`}
                aria-current={s === status ? 'page' : undefined}
                className="block rounded-ui-sm px-3 py-1.5 text-sm font-semibold text-muted aria-[current=page]:bg-surface aria-[current=page]:text-fg aria-[current=page]:shadow-sm"
              >
                {t(`statuses.${s}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {applications.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={status === 'pending' ? t('emptyPending') : t('empty')}
        />
      ) : (
        <ReviewQueue communityId={community.id} applications={applications} />
      )}
    </div>
  );
}
