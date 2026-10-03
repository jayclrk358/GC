'use client';

import Link from '@/components/ui/link';
import { useTranslations } from 'next-intl';
import { Gem, Sparkles } from 'lucide-react';
import { planFor, type PaidPlanId, type PlanPerks } from '@gamecentral/shared';

/**
 * Says a feature needs a paid plan, with a link to the community's billing settings. Anything
 * already set up is kept; it just isn't shown until the community upgrades.
 */
export function PlanLock({
  perk,
  plan: needed,
  slug,
  what,
}: {
  /** The perk that's needed (its cheapest plan is named), or give `plan` directly. */
  perk?: keyof PlanPerks;
  plan?: PaidPlanId;
  /** The community's address, for the link to its plans. */
  slug: string;
  /** The feature, as the reader knows it ("Role icons"). */
  what: string;
}) {
  const t = useTranslations('plans');
  const plan = needed ?? (perk ? planFor(perk) : 'plus');
  const Icon = plan === 'pro' ? Gem : Sparkles;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ui border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
      <Icon aria-hidden className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{t('lock.needs', { what, plan: t(`names.${plan}`) })}</span>{' '}
        <span className="text-muted">{t('lock.kept')}</span>
      </p>
      <Link
        href={`/c/${slug}/settings/billing`}
        className="font-semibold text-primary underline underline-offset-2"
      >
        {t('lock.cta', { plan: t(`names.${plan}`) })}
      </Link>
    </div>
  );
}
