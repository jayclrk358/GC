import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCustomDomain } from '@gamecentral/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { CustomDomain } from '@/components/community-settings/custom-domain';

export const metadata = { title: 'Custom domain' };

export default async function CustomDomainPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manage) notFound();
  const [t, data] = await Promise.all([getTranslations('customDomain'), getCustomDomain(ctx)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
      {/* Keyed by the domain, so the field shows it as saved (tidied) after a change. */}
      <CustomDomain
        key={data.domain ?? ''}
        communityId={community.id}
        slug={community.slug}
        data={data}
      />
    </div>
  );
}
