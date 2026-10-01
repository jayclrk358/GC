'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { PAID_PLAN_IDS, type BillingInterval, type PaidPlanId, type PlanId } from '@magnox/shared';
import type { BillingView, PlanPrices } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { SettingsSection } from '@/components/settings/section';
import {
  billingPortalAction,
  changePlanAction,
  setCancellationAction,
  startCheckoutAction,
} from '@/app/actions/billing';
import { IntervalSwitch, PlanBadgeIcon, PlanCard, usePrice } from './plans';

export function BillingPanel({
  communityId,
  slug,
  billing,
  prices,
  confirmed,
}: {
  communityId: string;
  slug: string;
  billing: BillingView;
  prices: PlanPrices;
  confirmed: 'active' | 'pending' | 'unknown' | null;
}) {
  const t = useTranslations('billing');
  const tp = useTranslations('plans');
  const format = useFormatter();
  const price = usePrice();
  const router = useRouter();
  const sub = billing.subscription;
  const [interval, setBillingInterval] = React.useState<BillingInterval>(sub?.interval ?? 'month');
  const [pending, setPending] = React.useState<string | null>(null);
  const date = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'long' }) : '';
  const planName = (p: PlanId) => tp(`names.${p}`);

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done?: string,
  ) {
    setPending(key);
    const r = await fn();
    setPending(null);
    if (!r.ok) toast.error(r.error ?? t('failed'));
    else {
      if (done) toast.success(done);
      router.refresh();
    }
  }

  async function goTo(
    key: string,
    fn: () => Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }>,
  ) {
    setPending(key);
    const r = await fn();
    if (r.ok) window.location.assign(r.data.url);
    else {
      setPending(null);
      toast.error(r.error);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmed === 'active' && (
        <Alert tone="success" live title={t('activated', { plan: planName(billing.plan) })} />
      )}
      {confirmed === 'pending' && <Alert tone="info" live title={t('confirming')} />}
      {!billing.enabled && !sub && <Alert tone="info">{t('notSetUp')}</Alert>}

      <SettingsSection id="current" title={t('currentPlan')}>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-2xl font-extrabold">
            {billing.plan !== 'free' && (
              <PlanBadgeIcon plan={billing.plan} className="size-6 text-primary" />
            )}
            {planName(billing.plan)}
          </p>
          {billing.gift && (
            <p className="text-sm" suppressHydrationWarning>
              {t('gifted', {
                plan: planName(billing.gift.plan),
                until: billing.gift.expiresAt ? date(billing.gift.expiresAt) : 'none',
              })}
            </p>
          )}
          {sub ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>
                {price(prices[sub.plan][sub.interval]) &&
                  `${price(prices[sub.plan][sub.interval])} ${sub.interval === 'month' ? tp('perMonth') : tp('perYear')} · `}
                {sub.cancelAtPeriodEnd
                  ? t('ends', { date: date(sub.currentPeriodEnd) })
                  : t('renews', { date: date(sub.currentPeriodEnd) })}
              </p>
              {sub.purchaser && (
                <p className="text-muted">
                  {t('paidBy', { name: sub.purchaser.name })}
                  {sub.mine && ` (${t('you')})`}
                </p>
              )}
              {sub.status === 'past_due' && (
                <Alert tone="warning" className="mt-2">
                  {t('pastDue')}
                </Alert>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">{t('freeNote')}</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="usage" title={t('usage')} description={t('usageDescription')}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {(['servers', 'roles', 'channels'] as const).map((k) => {
            const used = billing.usage[k];
            const limit = billing.limits[k];
            const pct = Math.min(100, Math.round((used / limit) * 100));
            return (
              <li key={k} className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">{tp(`rows.${k}`)}</span>
                <div
                  role="meter"
                  aria-label={tp(`rows.${k}`)}
                  aria-valuemin={0}
                  aria-valuemax={limit}
                  aria-valuenow={used}
                  aria-valuetext={t('usageOf', { used, limit })}
                  className="h-2 overflow-hidden rounded-full bg-border"
                >
                  <div
                    className={pct >= 90 ? 'h-full bg-warning' : 'h-full bg-primary'}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="text-xs text-muted tabular-nums">
                  {t('usageOf', { used, limit })}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-muted">
          {t('otherLimits', {
            attachments: billing.limits.attachments,
            image: billing.limits.imageMb,
            video: billing.limits.videoMb,
          })}
        </p>
      </SettingsSection>

      {billing.enabled && !sub && (
        <SettingsSection id="upgrade" title={t('upgrade')} description={t('upgradeDescription')}>
          <div className="flex flex-col gap-4">
            <IntervalSwitch value={interval} onChange={setBillingInterval} />
            <div className="grid gap-4 md:grid-cols-2">
              {PAID_PLAN_IDS.map((p) => (
                <PlanCard
                  key={p}
                  plan={p}
                  prices={prices}
                  interval={interval}
                  highlight={p === 'plus'}
                >
                  <Button
                    loading={pending === `buy-${p}`}
                    disabled={Boolean(pending) || !prices[p][interval]}
                    onClick={() =>
                      goTo(`buy-${p}`, () => startCheckoutAction(communityId, p, interval))
                    }
                  >
                    {t('buy', { plan: planName(p) })}
                  </Button>
                </PlanCard>
              ))}
            </div>
          </div>
        </SettingsSection>
      )}

      {sub && sub.mine && billing.enabled && (
        <SettingsSection id="manage" title={t('manage')}>
          <div className="flex flex-col gap-5">
            {!sub.cancelAtPeriodEnd && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold">{t('change')}</p>
                <IntervalSwitch value={interval} onChange={setBillingInterval} />
                <div className="flex flex-wrap gap-2">
                  {PAID_PLAN_IDS.map((p: PaidPlanId) => {
                    const same = p === sub.plan && interval === sub.interval;
                    const amount = price(prices[p][interval]);
                    return (
                      <Button
                        key={p}
                        variant={same ? 'secondary' : 'outline'}
                        disabled={same || Boolean(pending) || !amount}
                        loading={pending === `change-${p}`}
                        onClick={() =>
                          run(
                            `change-${p}`,
                            () => changePlanAction(communityId, p, interval),
                            t('changed', { plan: planName(p) }),
                          )
                        }
                      >
                        {same
                          ? t('onThisPlan', { plan: planName(p) })
                          : t('switchTo', { plan: planName(p), price: amount ?? '' })}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">{t('prorated')}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {sub.cancelAtPeriodEnd ? (
                <Button
                  loading={pending === 'resume'}
                  disabled={Boolean(pending)}
                  onClick={() =>
                    run('resume', () => setCancellationAction(communityId, false), t('resumed'))
                  }
                >
                  {t('resume')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  loading={pending === 'cancel'}
                  disabled={Boolean(pending)}
                  onClick={() => {
                    if (!window.confirm(t('cancelConfirm', { date: date(sub.currentPeriodEnd) })))
                      return;
                    void run(
                      'cancel',
                      () => setCancellationAction(communityId, true),
                      t('canceled', { date: date(sub.currentPeriodEnd) }),
                    );
                  }}
                >
                  {t('cancel')}
                </Button>
              )}
              <Button
                variant="ghost"
                loading={pending === 'portal'}
                disabled={Boolean(pending)}
                onClick={() => goTo('portal', () => billingPortalAction(communityId))}
              >
                {t('portal')} <ExternalLink aria-hidden />
              </Button>
            </div>
            <p className="text-xs text-muted">{t('cancelHint')}</p>
          </div>
        </SettingsSection>
      )}

      {sub && !sub.mine && (
        <Alert tone="info">
          {t('notPayer', { name: sub.purchaser?.name ?? t('someoneElse') })}
        </Alert>
      )}

      <p className="text-sm">
        <Link href={`/store?community=${slug}`} className="font-semibold text-primary underline">
          {t('compare')}
        </Link>
      </p>
    </div>
  );
}
