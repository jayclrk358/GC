// Community plans: what each one allows. Free matches what every community had before plans
// existed, so nobody loses anything; paid plans raise the limits and add perks.

export const PLAN_IDS = ['free', 'plus', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PaidPlanId = Exclude<PlanId, 'free'>;
export const PAID_PLAN_IDS = ['plus', 'pro'] as const satisfies readonly PaidPlanId[];

export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export interface PlanLimits {
  /** Game servers linked to the community. */
  servers: number;
  roles: number;
  /** Channels of every kind, categories included. */
  channels: number;
  /** Files on one chat message. */
  attachments: number;
  /** Largest image upload (banners, gallery, posts, chat), in MB. */
  imageMb: number;
  /** Largest chat video, in MB. */
  videoMb: number;
}

export interface PlanPerks {
  /** A plan badge on the community header and its Explore card. */
  badge: boolean;
  /** Shown in the Featured row on Explore. */
  featured: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { servers: 25, roles: 100, channels: 200, attachments: 4, imageMb: 10, videoMb: 50 },
  plus: { servers: 50, roles: 200, channels: 350, attachments: 8, imageMb: 20, videoMb: 100 },
  pro: { servers: 100, roles: 250, channels: 500, attachments: 10, imageMb: 25, videoMb: 150 },
};

export const PLAN_PERKS: Record<PlanId, PlanPerks> = {
  free: { badge: false, featured: false },
  plus: { badge: true, featured: false },
  pro: { badge: true, featured: true },
};

/** The highest value of each limit on any plan (for input validation before the plan is known). */
export const MAX_PLAN_LIMITS: PlanLimits = {
  servers: Math.max(...PLAN_IDS.map((p) => PLAN_LIMITS[p].servers)),
  roles: Math.max(...PLAN_IDS.map((p) => PLAN_LIMITS[p].roles)),
  channels: Math.max(...PLAN_IDS.map((p) => PLAN_LIMITS[p].channels)),
  attachments: Math.max(...PLAN_IDS.map((p) => PLAN_LIMITS[p].attachments)),
  imageMb: Math.max(...PLAN_IDS.map((p) => PLAN_LIMITS[p].imageMb)),
  videoMb: Math.max(...PLAN_IDS.map((p) => PLAN_LIMITS[p].videoMb)),
};

/**
 * Prices to show when Stripe can't be asked (payments not set up, or Stripe unreachable), in
 * the smallest currency unit. When Stripe is set up, the store shows its real prices instead.
 */
export const PLAN_LIST_PRICES: Record<PaidPlanId, Record<BillingInterval, number>> = {
  plus: { month: 499, year: 4990 },
  pro: { month: 999, year: 9990 },
};
export const PLAN_LIST_CURRENCY = 'usd';

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && (PLAN_IDS as readonly string[]).includes(v);
}

export function isPaidPlanId(v: unknown): v is PaidPlanId {
  return v === 'plus' || v === 'pro';
}

export function isBillingInterval(v: unknown): v is BillingInterval {
  return v === 'month' || v === 'year';
}

export function planLimits(plan: PlanId | null | undefined): PlanLimits {
  return PLAN_LIMITS[plan ?? 'free'] ?? PLAN_LIMITS.free;
}

export function planPerks(plan: PlanId | null | undefined): PlanPerks {
  return PLAN_PERKS[plan ?? 'free'] ?? PLAN_PERKS.free;
}

/** Free < Plus < Pro. */
export function planRank(plan: PlanId): number {
  return PLAN_IDS.indexOf(plan);
}

/** Subscription states that keep the plan on (past_due is a grace period while Stripe retries). */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

export function isActiveSubscriptionStatus(status: string): boolean {
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}
