import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { ThemeEditor } from '@/components/community-settings/theme-editor';

export const metadata = { title: 'Appearance' };

export default async function AppearancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { community, perms } = await loadCommunityForSettings((await params).slug);
  if (!perms.manage) notFound();
  const t = await getTranslations('theme');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <ThemeEditor
        communityId={community.id}
        communityName={community.name}
        initial={community.theme}
      />
    </div>
  );
}
