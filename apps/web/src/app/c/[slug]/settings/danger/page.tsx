import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { DeleteCommunity } from '@/components/community-settings/delete-community';

export const metadata = { title: 'Danger zone' };

export default async function DangerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { community, ctx } = await loadCommunityForSettings((await params).slug);
  if (!ctx.isOwner) notFound();
  const t = await getTranslations('csettings');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('danger.title')} description={t('danger.description')} />
      <DeleteCommunity communityId={community.id} slug={community.slug} />
    </div>
  );
}
