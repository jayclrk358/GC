import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { listHeldPosts } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { HeldQueue } from '@/components/automod/held-queue';

export const metadata = { title: 'Mod queue' };

const STATUSES = ['pending', 'approved', 'rejected'] as const;

export default async function ModQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { slug } = await params;
  const { community, perms, ctx } = await loadCommunityForSettings(slug);
  if (!perms.manageMessages) notFound();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as (typeof STATUSES)[number])
    : 'pending';
  const t = await getTranslations('modQueue');
  const items = await listHeldPosts(ctx, status);
  const base = `/c/${slug}/settings/mod-queue`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={
          <>
            {t('description')}{' '}
            {perms.manage && (
              <Link
                href={`/c/${slug}/settings/automod`}
                className="font-semibold text-primary underline"
              >
                {t('rulesLink')}
              </Link>
            )}
          </>
        }
      />
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
      {items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title={status === 'pending' ? t('emptyPending') : t('empty')}
        />
      ) : (
        <HeldQueue communityId={community.id} items={items} />
      )}
    </div>
  );
}
