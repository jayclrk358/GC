import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listChannelRows, listFlairs, listRoles } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { ChannelManager } from '@/components/community-settings/channel-manager';
import { FlairManager } from '@/components/community-settings/flair-manager';

export const metadata = { title: 'Channels' };

export default async function ChannelSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manageChannels) notFound();
  const t = await getTranslations('channels');
  const [rows, roles, flairs] = await Promise.all([
    listChannelRows(community.id),
    listRoles(community.id),
    listFlairs(community.id),
  ]);
  const channels = rows
    .filter((r) => r.type !== 'wiki')
    .map((r) => ({
      id: r.id,
      parentId: r.parentId,
      type: r.type,
      name: r.name,
      topic: r.topic,
      position: r.position,
      settings: r.settings,
      slowmodeSeconds: r.slowmodeSeconds,
    }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <ChannelManager
        communityId={community.id}
        slug={slug}
        channels={channels}
        roles={roles.map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault }))}
        canEditPerms={perms.manageRoles}
      />
      <FlairManager
        communityId={community.id}
        flairs={flairs.map((f) => ({
          id: f.id,
          name: f.name,
          color: f.color,
          channelId: f.channelId,
          modOnly: f.modOnly,
        }))}
        channels={channels
          .filter((c) => c.type !== 'category')
          .map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
