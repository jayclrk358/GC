import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { confirmCheckout, getBilling, planPrices } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { BillingPanel } from '@/components/billing/billing-panel';

export const metadata = { title: 'Plan & billing' };

export default async function BillingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { community, perms, ctx } = await loadCommunityForSettings((await params).slug);
  if (!perms.manage) notFound();
  const t = await getTranslations('billing');
  const { checkout } = await searchParams;
  // Coming back from Stripe Checkout: record the plan now rather than waiting for the webhook.
  const confirmed = checkout ? await confirmCheckout(ctx, checkout) : null;
  const [billing, { prices }] = await Promise.all([getBilling(ctx), planPrices()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <BillingPanel
        communityId={community.id}
        slug={community.slug}
        billing={billing}
        prices={prices}
        confirmed={confirmed}
      />
    </div>
  );
}
