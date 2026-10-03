import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAutomod, listRoles } from '@gamecentral/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { AutomodEditor } from '@/components/automod/automod-editor';

export const metadata = { title: 'Automod' };

export default async function AutomodPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manage) notFound();
  const [t, automod, roles] = await Promise.all([
    getTranslations('automod'),
    getAutomod(community.id),
    listRoles(community.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <AutomodEditor
        communityId={community.id}
        initial={automod.config}
        joinsPausedUntil={automod.joinsPausedUntil?.toISOString() ?? null}
        roles={roles
          .filter((r) => !r.isDefault)
          .sort((a, b) => b.position - a.position)
          .map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
