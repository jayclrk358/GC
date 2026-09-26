import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listInvites } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { InviteButton } from '@/components/community/invite-button';
import { InviteList } from '@/components/community-settings/invite-list';

export const metadata = { title: 'Invites' };

export default async function InvitesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { community, perms, ctx } = await loadCommunityForSettings((await params).slug);
  if (!perms.manageInvites && !perms.createInvite) notFound();
  const t = await getTranslations('invites');
  const invites = await listInvites(ctx);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('manageTitle')}
        description={t('manageDescription')}
        actions={perms.createInvite ? <InviteButton communityId={community.id} /> : undefined}
      />
      <InviteList
        communityId={community.id}
        invites={invites.map((i) => ({
          ...i,
          expiresAt: i.expiresAt?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
