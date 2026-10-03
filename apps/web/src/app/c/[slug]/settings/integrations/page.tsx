import Link from '@/components/ui/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listWebhooks } from '@gamecentral/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { WebhookManager } from '@/components/integrations/webhook-manager';

export const metadata = { title: 'Integrations' };

export default async function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manage) notFound();
  const [t, webhooks] = await Promise.all([getTranslations('integrations'), listWebhooks(ctx)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <p className="text-sm">
        <Link href="/developers" className="font-semibold text-primary underline">
          {t('docs')}
        </Link>
      </p>
      <WebhookManager communityId={community.id} webhooks={webhooks} />
    </div>
  );
}
