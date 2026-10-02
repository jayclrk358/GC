import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listCommunityServers } from '@magnox/core';
import { PROTOCOL_KEYS, SERVER_PROTOCOLS } from '@magnox/shared';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { ServerManager } from '@/components/community-settings/server-manager';

export const metadata = { title: 'Servers' };

export default async function ServerSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { community, perms } = await loadCommunityForSettings((await params).slug);
  if (!perms.manageServers) notFound();
  const t = await getTranslations('serverSettings');
  const servers = await listCommunityServers(community.id, { manage: true });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <ServerManager
        communityId={community.id}
        servers={servers}
        protocols={PROTOCOL_KEYS.map((k) => ({
          key: k,
          label: SERVER_PROTOCOLS[k].label,
          defaultPort: SERVER_PROTOCOLS[k].defaultPort,
        }))}
      />
    </div>
  );
}
