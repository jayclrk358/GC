import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { normalizeNav } from '@magnox/shared';
import { AVAILABLE_TABS, loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { NavEditor } from '@/components/community-settings/nav-editor';

export const metadata = { title: 'Navigation' };

export default async function NavigationSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { community, perms } = await loadCommunityForSettings((await params).slug);
  if (!perms.manage) notFound();
  const t = await getTranslations('csettings');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('navigation.title')} description={t('navigation.description')} />
      <NavEditor
        communityId={community.id}
        initial={normalizeNav(community.nav)}
        available={[...AVAILABLE_TABS]}
      />
    </div>
  );
}
