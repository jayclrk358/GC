import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getDiscordLink, listWebhooks } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { WebhookManager } from '@/components/integrations/webhook-manager';
import { DiscordLink } from '@/components/integrations/discord-link';

export const metadata = { title: 'Integrations' };

export default async function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manage) notFound();
  const [t, webhooks, discord] = await Promise.all([
    getTranslations('integrations'),
    listWebhooks(ctx),
    getDiscordLink(ctx),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <p className="text-sm">
        <Link href="/developers" className="font-semibold text-primary underline">
          {t('docs')}
        </Link>
      </p>
      <WebhookManager communityId={community.id} webhooks={webhooks} />
      <DiscordLink communityId={community.id} data={discord} />
    </div>
  );
}
