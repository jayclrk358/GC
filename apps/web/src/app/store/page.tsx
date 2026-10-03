import { getTranslations } from 'next-intl/server';
import { billingEnabled, manageableCommunities, planPrices } from '@gamecentral/core';
import { getUser } from '@/lib/auth';
import { StoreClient } from '@/components/billing/store-client';

export async function generateMetadata() {
  const t = await getTranslations('store');
  return { title: t('title'), description: t('intro') };
}

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string; canceled?: string }>;
}) {
  const t = await getTranslations('store');
  const user = await getUser();
  const { community } = await searchParams;
  const [{ prices }, communities] = await Promise.all([
    planPrices(),
    user ? manageableCommunities(user.id) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 lg:px-8">
      <header className="mx-page-enter flex flex-col items-center gap-3 text-center">
        <p className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-semibold text-muted">
          {t('eyebrow')}
        </p>
        <h1 className="font-heading text-4xl font-extrabold sm:text-5xl">{t('heading')}</h1>
        <p className="max-w-2xl text-lg text-muted">{t('intro')}</p>
      </header>
      <StoreClient
        signedIn={Boolean(user)}
        enabled={billingEnabled()}
        prices={prices}
        communities={communities}
        preselect={community ?? null}
      />
    </div>
  );
}
