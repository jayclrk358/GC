// Community plans: what each one allows. Free covers everything a community needs to get going;
// Plus adds room to grow, voice and a custom look; Pro is for big, busy communities. Lowering a
// limit never takes anything away: a community over it keeps what it has, it just can't add more.

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
  /** Voice channels (0: none). */
  voiceChannels: number;
  /** People in one voice channel at a time. */
  voiceParticipants: number;
  /** Custom emoji. */
  emoji: number;
  /** What one person may upload to the community in a day (files and their smaller copies), MB. */
  dailyUploadMb: number;
  /** Webhooks sending the community's activity elsewhere. */
  webhooks: number;
}

export interface PlanPerks {
  /** A plan badge on the community header and its Explore card. */
  badge: boolean;
  /** Shown in the Featured row on Explore. */
  featured: boolean;
  /** Name and role effects beyond a plain colour: gradients, glow, rainbow, animations. */
  nameEffects: boolean;
  /** Small images beside role names. */
  roleIcons: boolean;
  /** A picture behind the whole community. */
  pageBackground: boolean;
  /** Pictures behind chat channels. */
  chatBackgrounds: boolean;
  /** Labelled dividers in channel lists. */
  separators: boolean;
  /** Sharing a screen in voice channels. */
  screenShare: boolean;
  /** The community's public pages on its own domain. */
  customDomain: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    servers: 3,
    roles: 25,
    channels: 50,
    attachments: 4,
    imageMb: 10,
    videoMb: 25,
    voiceChannels: 0,
    voiceParticipants: 0,
    emoji: 25,
    dailyUploadMb: 500,
    webhooks: 2,
  },
  plus: {
    servers: 15,
    roles: 100,
    channels: 150,
    attachments: 8,
    imageMb: 25,
    videoMb: 100,
    voiceChannels: 5,
    voiceParticipants: 25,
    emoji: 100,
    dailyUploadMb: 2000,
    webhooks: 10,
  },
  pro: {
    servers: 50,
    roles: 250,
    channels: 500,
    attachments: 10,
    imageMb: 50,
    // Uploads also have to fit under the web server's request limit (160 MB).
    videoMb: 150,
    voiceChannels: 20,
    voiceParticipants: 50,
    emoji: 250,
    dailyUploadMb: 5000,
    webhooks: 25,
  },
};

const PAID_PERKS = {
  nameEffects: true,
  roleIcons: true,
  pageBackground: true,
  chatBackgrounds: true,
  separators: true,
};

/**
 * What each plan unlocks. A community that drops to Free keeps its settings for these; they
 * just stop showing until it upgrades again.
 */
export const PLAN_PERKS: Record<PlanId, PlanPerks> = {
  free: {
    badge: false,
    featured: false,
    nameEffects: false,
    roleIcons: false,
    pageBackground: false,
    chatBackgrounds: false,
    separators: false,
    screenShare: false,
    customDomain: false,
  },
  plus: { badge: true, featured: false, ...PAID_PERKS, screenShare: false, customDomain: false },
  pro: { badge: true, featured: true, ...PAID_PERKS, screenShare: true, customDomain: true },
};

/** The cheapest plan with a perk, for "upgrade to …" prompts. */
export function planFor(perk: keyof PlanPerks): PaidPlanId {
  return PLAN_PERKS.plus[perk] ? 'plus' : 'pro';
}

/** The highest value of each limit on any plan (for input validation before the plan is known). */
export const MAX_PLAN_LIMITS = Object.fromEntries(
  (Object.keys(PLAN_LIMITS.free) as (keyof PlanLimits)[]).map((k) => [
    k,
    Math.max(...PLAN_IDS.map((p) => PLAN_LIMITS[p][k])),
  ]),
) as unknown as PlanLimits;

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
