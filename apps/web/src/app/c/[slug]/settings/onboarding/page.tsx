import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getOnboarding, listRoles } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { OnboardingEditor } from '@/components/onboarding/onboarding-editor';

export const metadata = { title: 'Welcome steps' };

export default async function OnboardingSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manage) notFound();
  const [t, onboarding, roles] = await Promise.all([
    getTranslations('welcome.editor'),
    getOnboarding(community.id),
    listRoles(community.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
      <OnboardingEditor
        communityId={community.id}
        slug={slug}
        initial={onboarding}
        pickableRoles={roles.filter((r) => r.selfAssignable && !r.isDefault).length}
      />
    </div>
  );
}
