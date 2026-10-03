import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listBlocks, listCommunityServers, listRoles } from '@gamecentral/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { PageBuilder } from '@/components/community-settings/page-builder';

export const metadata = { title: 'Page builder' };

export default async function PageBuilderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { community, perms } = await loadCommunityForSettings((await params).slug);
  if (!perms.manage) notFound();
  const t = await getTranslations('blocks');
  const [blocks, roles, servers] = await Promise.all([
    listBlocks(community.id, { includeHidden: true }),
    listRoles(community.id),
    listCommunityServers(community.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <PageBuilder
        communityId={community.id}
        slug={community.slug}
        initialBlocks={blocks}
        roles={roles.filter((r) => !r.isDefault).map((r) => ({ id: r.id, name: r.name }))}
        servers={servers.map((s) => ({ id: s.id, name: s.name }))}
        requireAlt={Boolean(community.settings.requireAltText)}
      />
    </div>
  );
}
