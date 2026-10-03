import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listGames } from '@gamecentral/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { GeneralSettings } from '@/components/community-settings/general-settings';

export const metadata = { title: 'Settings' };

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community, perms, ctx } = await loadCommunityForSettings(slug);
  if (!perms.manage) {
    const first = perms.manageRoles
      ? 'roles'
      : perms.manageServers
        ? 'servers'
        : perms.viewAudit
          ? 'audit'
          : 'invites';
    redirect(`/c/${slug}/settings/${first}`);
  }
  const t = await getTranslations('csettings');
  const games = await listGames();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('general.title')} description={t('general.description')} />
      <GeneralSettings
        communityId={community.id}
        isOwner={ctx.isOwner}
        games={games}
        initial={{
          name: community.name,
          slug: community.slug,
          tagline: community.tagline,
          gameId: community.gameId ?? '',
          playUrl: community.playUrl ?? '',
          tags: community.tags.join(', '),
          region: community.region,
          language: community.language,
          visibility: community.visibility,
          joinMode: community.joinMode,
          nsfw: community.nsfw,
          showMemberCount: community.settings.showMemberCount !== false,
          requireAltText: Boolean(community.settings.requireAltText),
          welcomeMessage: community.settings.welcomeMessage ?? '',
        }}
      />
    </div>
  );
}
