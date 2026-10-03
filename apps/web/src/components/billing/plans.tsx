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
} from '@gamecentral/shared';
import type { PlanPrices } from '@gamecentral/core';
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

/** Sizes as people say them: MB under a gigabyte, GB from there. */
function useSize() {
  const t = useTranslations('plans');
  return (mb: number) => (mb >= 1000 ? t('gb', { count: mb / 1000 }) : t('mb', { count: mb }));
}

/** The plan below, which each card builds on ("Everything in Plus, plus:"). */
const BUILDS_ON: Partial<Record<PlanId, PlanId>> = { plus: 'free', pro: 'plus' };

/** A plan's highlights, as a checklist: what it's for, not every number (that's the table). */
export function PlanFeatures({ plan, className }: { plan: PlanId; className?: string }) {
  const t = useTranslations('plans');
  const size = useSize();
  const l = PLAN_LIMITS[plan];
  const room = t('features.room', { servers: l.servers, channels: l.channels, roles: l.roles });
  const media = t('features.media', {
    image: size(l.imageMb),
    video: size(l.videoMb),
    daily: size(l.dailyUploadMb),
  });
  const extras = t('features.extras', { emoji: l.emoji, webhooks: l.webhooks });
  const voice = t('features.voice', { count: l.voiceChannels, people: l.voiceParticipants });
  const items =
    plan === 'free'
      ? [t('features.core'), room, extras, media]
      : plan === 'plus'
        ? [
            room,
            voice,
            t('features.style'),
            extras,
            media,
            t('features.badge', { plan: t('names.plus') }),
          ]
        : [
            room,
            t('features.voicePro', { count: l.voiceChannels, people: l.voiceParticipants }),
            t('features.customDomain'),
            t('features.featured'),
            extras,
            media,
            t('features.badge', { plan: t('names.pro') }),
          ];
  const base = BUILDS_ON[plan];
  return (
    <div className={cn('flex flex-col gap-2 text-sm', className)}>
      {base && <p className="font-semibold">{t('includes', { plan: t(`names.${base}`) })}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
    </div>
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

type Row = keyof PlanLimits | keyof PlanPerks;

/** The comparison, in sections. */
const GROUPS: { id: 'community' | 'media' | 'voice' | 'style' | 'reach'; rows: Row[] }[] = [
  { id: 'community', rows: ['servers', 'channels', 'roles', 'emoji', 'webhooks'] },
  { id: 'media', rows: ['attachments', 'imageMb', 'videoMb', 'dailyUploadMb'] },
  { id: 'voice', rows: ['voiceChannels', 'voiceParticipants', 'screenShare'] },
  {
    id: 'style',
    rows: ['nameEffects', 'roleIcons', 'pageBackground', 'chatBackgrounds', 'separators'],
  },
  { id: 'reach', rows: ['badge', 'customDomain', 'featured'] },
];

const isPerk = (row: string): row is keyof PlanPerks => row in PLAN_PERKS.free;

/** Every limit and perk, side by side. */
export function ComparisonTable() {
  const t = useTranslations('plans');
  const size = useSize();
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
        {GROUPS.map((group) => (
          <tbody key={group.id}>
            <tr className="border-b border-border bg-surface-2/60">
              <th
                scope="colgroup"
                colSpan={PLAN_IDS.length + 1}
                className="p-2 text-start text-xs font-bold tracking-wide text-muted uppercase sm:px-3"
              >
                {t(`compare.groups.${group.id}`)}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row} className="border-b border-border">
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
                      v === 0
                        ? t('compare.none')
                        : row === 'imageMb' || row === 'videoMb'
                          ? size(v)
                          : row === 'dailyUploadMb'
                            ? t('perDay', { size: size(v) })
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
        ))}
      </table>
    </div>
  );
}
