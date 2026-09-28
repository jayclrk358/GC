import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listMembers, listRoles, roleSummary } from '@magnox/core';
import { themeBackdrops } from '@magnox/shared';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { MemberSearch } from '@/components/community/member-search';
import { MemberManager } from '@/components/community-settings/member-manager';

export const metadata = { title: 'Members' };

export default async function MemberSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { community, perms, ctx } = await loadCommunityForSettings((await params).slug);
  if (!perms.manageRoles && !perms.kick && !perms.ban && !perms.timeout) notFound();
  const { q } = await searchParams;
  const t = await getTranslations('roles');
  const [{ members }, roles] = await Promise.all([
    listMembers(community.id, community.ownerId, { q, limit: 100 }),
    listRoles(community.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('membersTitle')}
        description={t('membersDescription')}
        actions={<MemberSearch defaultValue={q ?? ''} />}
      />
      <MemberManager
        communityId={community.id}
        backdrops={themeBackdrops(community.theme)}
        members={members.map((m) => ({
          userId: m.userId,
          name: m.nickname || m.name,
          username: m.username,
          image: m.image,
          roleIds: m.roleIds,
          isOwner: m.isOwner,
          timeoutUntil: m.timeoutUntil?.toISOString() ?? null,
        }))}
        roles={roles.filter((r) => !r.isDefault).map(roleSummary)}
        actor={{
          isOwner: ctx.isOwner,
          topPosition: Number.isFinite(ctx.topPosition) ? ctx.topPosition : 1_000_000,
          userId: ctx.userId!,
        }}
        can={{ roles: perms.manageRoles, kick: perms.kick, ban: perms.ban, timeout: perms.timeout }}
      />
    </div>
  );
}
