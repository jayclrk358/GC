import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listRoles, roleSummary } from '@magnox/core';
import { ALL_PERMISSIONS, planPerks, themeBackdrops } from '@magnox/shared';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { RoleEditor } from '@/components/community-settings/role-editor';

export const metadata = { title: 'Roles' };

export default async function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { community, perms, ctx } = await loadCommunityForSettings((await params).slug);
  if (!perms.manageRoles) notFound();
  const t = await getTranslations('roles');
  const roles = await listRoles(community.id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <RoleEditor
        communityId={community.id}
        roles={roles.map(roleSummary)}
        backdrops={themeBackdrops(community.theme)}
        slug={community.slug}
        perks={planPerks(community.plan)}
        actor={{
          isOwner: ctx.isOwner,
          topPosition: Number.isFinite(ctx.topPosition) ? ctx.topPosition : 1_000_000,
          perms: (ctx.isOwner ? ALL_PERMISSIONS : ctx.base).toString(),
        }}
      />
    </div>
  );
}
