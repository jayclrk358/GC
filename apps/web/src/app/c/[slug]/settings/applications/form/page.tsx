import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getApplicationForm } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { BackLink } from '@/components/ui/back-link';
import { PageHeader } from '@/components/ui/misc';
import { ApplicationFormEditor } from '@/components/applications/form-editor';

export const metadata = { title: 'Application form' };

export default async function ApplicationFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manage) notFound();
  const [t, form] = await Promise.all([
    getTranslations('applications.form'),
    getApplicationForm(community.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      {perms.reviewApplications && (
        <BackLink href={`/c/${slug}/settings/applications`}>{t('back')}</BackLink>
      )}
      <PageHeader title={t('title')} description={t('description')} />
      <ApplicationFormEditor communityId={community.id} initial={form} />
    </div>
  );
}
