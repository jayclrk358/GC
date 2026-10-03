'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import {
  PAID_PLAN_IDS,
  type BillingInterval,
  type PaidPlanId,
  type PlanId,
} from '@gamecentral/shared';
import type { PlanPrices } from '@gamecentral/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { startCheckoutAction } from '@/app/actions/billing';
import { ComparisonTable, IntervalSwitch, PlanCard, usePrice } from './plans';

interface ManagedCommunity {
  id: string;
  slug: string;
  name: string;
  plan: PlanId;
}

export function StoreClient({
  signedIn,
  enabled,
  prices,
  communities,
  preselect,
}: {
  signedIn: boolean;
  enabled: boolean;
  prices: PlanPrices;
  communities: ManagedCommunity[];
  /** A community slug to pick by default (from its Plan & billing page). */
  preselect: string | null;
}) {
  const t = useTranslations('store');
  const tp = useTranslations('plans');
  const price = usePrice();
  const [interval, setBillingInterval] = React.useState<BillingInterval>('month');
  const [buying, setBuying] = React.useState<PaidPlanId | null>(null);
  const initial =
    communities.find((c) => c.slug === preselect) ??
    communities.find((c) => c.plan === 'free') ??
    communities[0];
  const [communityId, setCommunityId] = React.useState(initial?.id ?? '');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const chosen = communities.find((c) => c.id === communityId);

  async function checkout() {
    if (!buying || !chosen) return;
    setPending(true);
    setError(null);
    const r = await startCheckoutAction(chosen.id, buying, interval);
    if (r.ok) window.location.assign(r.data.url);
    else {
      setPending(false);
      setError(r.error);
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-8">
        <IntervalSwitch value={interval} onChange={setBillingInterval} />
        {!enabled && <Alert tone="info">{t('notSetUp')}</Alert>}
        <div className="grid w-full gap-5 md:grid-cols-3">
          <PlanCard plan="free" prices={prices} interval={interval}>
            <Button asChild variant="outline">
              <Link href={signedIn ? '/new' : '/sign-up'}>{t('startFree')}</Link>
            </Button>
          </PlanCard>
          {PAID_PLAN_IDS.map((p) => (
            <PlanCard key={p} plan={p} prices={prices} interval={interval} highlight={p === 'plus'}>
              {!signedIn ? (
                <Button asChild variant={p === 'plus' ? 'primary' : 'outline'}>
                  <Link href="/sign-in?next=/store">{t('signInToBuy')}</Link>
                </Button>
              ) : (
                <Button
                  variant={p === 'plus' ? 'primary' : 'outline'}
                  disabled={!enabled || !prices[p][interval]}
                  onClick={() => {
                    setError(null);
                    setBuying(p);
                  }}
                >
                  {t('choose', { plan: tp(`names.${p}`) })}
                </Button>
              )}
            </PlanCard>
          ))}
        </div>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Lock aria-hidden className="size-4" />
          {t('secure')}
        </p>
      </div>

      <section aria-labelledby="compare-h" className="flex flex-col gap-4">
        <h2 id="compare-h" className="text-2xl font-extrabold">
          {tp('compare.caption')}
        </h2>
        <ComparisonTable />
      </section>

      <section aria-labelledby="faq-h" className="flex flex-col gap-3">
        <h2 id="faq-h" className="text-2xl font-extrabold">
          {t('faqTitle')}
        </h2>
        {(['who', 'cancel', 'downgrade', 'switch', 'pay'] as const).map((k) => (
          <details
            key={k}
            className="group rounded-ui border border-border bg-surface px-4 py-3 open:pb-4"
          >
            <summary className="cursor-pointer font-semibold">{t(`faq.${k}.q`)}</summary>
            <p className="mt-2 text-sm text-muted">{t(`faq.${k}.a`)}</p>
          </details>
        ))}
      </section>

      <Dialog open={Boolean(buying)} onOpenChange={(o) => !o && setBuying(null)}>
        {buying && (
          <DialogContent
            title={t('pickTitle', { plan: tp(`names.${buying}`) })}
            description={t('pickDescription', {
              plan: tp(`names.${buying}`),
              price: `${price(prices[buying][interval]) ?? ''} ${interval === 'month' ? tp('perMonth') : tp('perYear')}`,
            })}
          >
            {communities.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm">{t('noCommunities')}</p>
                <Button asChild>
                  <Link href="/new">{t('create')}</Link>
                </Button>
              </div>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void checkout();
                }}
              >
                <Field label={t('community')}>
                  {(p) => (
                    <Select {...p} value={communityId} onValueChange={setCommunityId}>
                      {communities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.plan === 'free'
                            ? c.name
                            : t('onPlan', { name: c.name, plan: tp(`names.${c.plan}`) })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {chosen && chosen.plan !== 'free' && (
                  <Alert tone="info">
                    {t('alreadyPaid', { name: chosen.name })}{' '}
                    <Link
                      href={`/c/${chosen.slug}/settings/billing`}
                      className="font-semibold text-primary underline"
                    >
                      {t('manage')}
                    </Link>
                  </Alert>
                )}
                {error && (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  loading={pending}
                  disabled={!chosen || chosen.plan !== 'free'}
                >
                  {t('continue')}
                </Button>
              </form>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
