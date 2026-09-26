import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Ban } from 'lucide-react';
import { listBans } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { formatDateTime } from '@/lib/format';
import { Avatar, EmptyState, PageHeader } from '@/components/ui/misc';
import { UnbanButton } from '@/components/moderation/unban-button';

export const metadata = { title: 'Bans' };

export default async function BansPage({ params }: { params: Promise<{ slug: string }> }) {
  const { community, perms, ctx } = await loadCommunityForSettings((await params).slug);
  if (!perms.ban) notFound();
  const t = await getTranslations('moderation');
  const bans = await listBans(ctx);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('bansTitle')} description={t('bansDescription')} />
      {bans.length === 0 ? (
        <EmptyState icon={<Ban />} title={t('noBans')} />
      ) : (
        <ul className="divide-y divide-border rounded-ui-lg border border-border bg-surface">
          {bans.map((b) => (
            <li key={b.userId} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar src={b.image} name={b.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {b.name}
                  {b.username && <span className="font-normal text-muted"> @{b.username}</span>}
                </p>
                <p className="text-sm text-muted">
                  {t('bannedBy', {
                    name: b.moderator ?? t('someone'),
                    date: formatDateTime(b.createdAt),
                  })}
                  {' · '}
                  {b.expiresAt
                    ? t('expires', { date: formatDateTime(b.expiresAt) })
                    : t('permanent')}
                </p>
                {b.reason && <p className="text-sm">{b.reason}</p>}
              </div>
              <UnbanButton communityId={community.id} userId={b.userId} name={b.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
