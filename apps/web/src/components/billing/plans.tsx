'use client';

import * as React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { RadioGroup } from 'radix-ui';
import { Check, Gem, Minus, Sparkles } from 'lucide-react';
import {
  PLAN_IDS,
  PLAN_LIMITS,
  PLAN_PERKS,
  type BillingInterval,
  type PaidPlanId,
  type PlanId,
  type PlanLimits,
  type PlanPerks,
} from '@magnox/shared';
import type { PlanPrices } from '@magnox/core';
import { cn } from '@/lib/utils';

/** Monthly or yearly, as a two-option switch. */
export function IntervalSwitch({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  const t = useTranslations('plans');
  return (
    <RadioGroup.Root
      aria-label={t('interval')}
      value={value}
      onValueChange={(v) => onChange(v as BillingInterval)}
      className="inline-flex w-fit self-center rounded-full border border-border bg-surface p-1 sm:self-auto"
    >
      {(['month', 'year'] as const).map((i) => (
        <RadioGroup.Item
          key={i}
          value={i}
          className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-fg data-[state=checked]:bg-primary data-[state=checked]:text-on-primary"
        >
          {i === 'month' ? t('monthly') : t('yearly')}
          {i === 'year' && (
            <span className="rounded-full bg-success/15 px-1.5 text-xs text-success in-data-[state=checked]:bg-on-primary/20 in-data-[state=checked]:text-on-primary">
              {t('save')}
            </span>
          )}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export function usePrice() {
  const format = useFormatter();
  return (price: { amount: number; currency: string } | null | undefined) =>
    price
      ? format.number(price.amount / 100, {
          style: 'currency',
          currency: price.currency.toUpperCase(),
          minimumFractionDigits: price.amount % 100 ? 2 : 0,
        })
      : null;
}

/** The plan's headline limits and perks, as a checklist. */
export function PlanFeatures({ plan, className }: { plan: PlanId; className?: string }) {
  const t = useTranslations('plans');
  const l = PLAN_LIMITS[plan];
  const perks = PLAN_PERKS[plan];
  const items: string[] = [
    t('features.servers', { count: l.servers }),
    t('features.roles', { count: l.roles }),
    t('features.channels', { count: l.channels }),
    t('features.attachments', { count: l.attachments }),
    t('features.imageMb', { count: l.imageMb }),
    t('features.videoMb', { count: l.videoMb }),
  ];
  if (l.voiceChannels) {
    items.push(
      t('features.voiceChannels', { count: l.voiceChannels, people: l.voiceParticipants }),
    );
  }
  if (perks.screenShare) items.push(t('features.screenShare'));
  for (const perk of [
    'nameEffects',
    'roleIcons',
    'pageBackground',
    'chatBackgrounds',
    'separators',
  ] as const) {
    if (perks[perk]) items.push(t(`features.${perk}`));
  }
  if (perks.badge) items.push(t('features.badge', { plan: t(`names.${plan}`) }));
  if (perks.featured) items.push(t('features.featured'));
  return (
    <ul className={cn('flex flex-col gap-2 text-sm', className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PlanBadgeIcon({ plan, className }: { plan: PlanId; className?: string }) {
  return plan === 'pro' ? (
    <Gem aria-hidden className={className} />
  ) : (
    <Sparkles aria-hidden className={className} />
  );
}

/** A plan's card: name, price, what it includes, and whatever action fits (passed in). */
export function PlanCard({
  plan,
  prices,
  interval,
  current,
  highlight,
  children,
}: {
  plan: PlanId;
  prices: PlanPrices;
  interval: BillingInterval;
  current?: boolean;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations('plans');
  const price = usePrice();
  const amount = plan === 'free' ? null : price(prices[plan as PaidPlanId][interval]);
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'relative flex flex-col gap-5 rounded-ui-lg border bg-surface p-6',
        highlight ? 'border-2 border-primary shadow-lg' : 'border-border',
      )}
    >
      {highlight && (
        <p className="absolute start-6 -top-3 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-on-primary">
          {t('popular')}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="flex items-center gap-2 text-xl font-extrabold">
          {plan !== 'free' && <PlanBadgeIcon plan={plan} className="size-5 text-primary" />}
          {t(`names.${plan}`)}
          {current && (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              {t('current')}
            </span>
          )}
        </h2>
        {/* Two lines tall, so prices line up across cards. */}
        <p className="min-h-10 text-sm text-muted">{t(`taglines.${plan}`)}</p>
      </div>
      <p className="flex items-baseline gap-1">
        {plan === 'free' ? (
          <span className="text-3xl font-extrabold">{t('freePrice')}</span>
        ) : amount ? (
          <>
            <span className="text-3xl font-extrabold tabular-nums">{amount}</span>
            <span className="text-sm text-muted">
              {interval === 'month' ? t('perMonth') : t('perYear')}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted">{t('unavailable')}</span>
        )}
      </p>
      <PlanFeatures plan={plan} className="flex-1" />
      {children}
    </section>
  );
}

const ROWS: (keyof PlanLimits | keyof PlanPerks)[] = [
  'servers',
  'roles',
  'channels',
  'attachments',
  'imageMb',
  'videoMb',
  'voiceChannels',
  'voiceParticipants',
  'screenShare',
  'nameEffects',
  'roleIcons',
  'pageBackground',
  'chatBackgrounds',
  'separators',
  'badge',
  'featured',
];

const isPerk = (row: string): row is keyof PlanPerks => row in PLAN_PERKS.free;

/** Every limit and perk, side by side. */
export function ComparisonTable() {
  const t = useTranslations('plans');
  return (
    <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('compare.caption')}</caption>
        <thead>
          <tr className="border-b border-border text-start">
            <th scope="col" className="p-2 text-start font-semibold sm:p-3">
              {t('compare.feature')}
            </th>
            {PLAN_IDS.map((p) => (
              <th key={p} scope="col" className="p-2 text-center font-bold sm:p-3">
                {t(`names.${p}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row} className="border-b border-border last:border-b-0">
              <th scope="row" className="p-2 text-start font-medium sm:p-3">
                {t(`rows.${row}`)}
              </th>
              {PLAN_IDS.map((p) => {
                let cell: React.ReactNode;
                if (isPerk(row)) {
                  cell = PLAN_PERKS[p][row] ? (
                    <Check
                      aria-label={t('compare.yes')}
                      role="img"
                      className="mx-auto size-4 text-success"
                    />
                  ) : (
                    <Minus
                      aria-label={t('compare.no')}
                      role="img"
                      className="mx-auto size-4 text-muted"
                    />
                  );
                } else {
                  const v = PLAN_LIMITS[p][row as keyof PlanLimits];
                  cell =
                    row === 'imageMb' || row === 'videoMb'
                      ? t('mb', { count: v })
                      : v === 0
                        ? t('compare.none')
                        : v;
                }
                return (
                  <td key={p} className="p-2 text-center whitespace-nowrap tabular-nums sm:p-3">
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
