import Stripe from 'stripe';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  isActiveSubscriptionStatus,
  isBillingInterval,
  isPaidPlanId,
  newId,
  Permission,
  PAID_PLAN_IDS,
  PLAN_LIST_CURRENCY,
  PLAN_LIST_PRICES,
  planLimits,
  planRank,
  type BillingInterval,
  type PaidPlanId,
  type PlanId,
  PLAN_IDS,
  PLAN_LIMITS,
  planFor,
  planPerks,
  type PlanPerks,
} from '@magnox/shared';
import { requirePerm, type MemberContext } from '../access';
import { communityChanged } from '../emitter';
import { env } from '../env';
import { AppError, forbidden } from '../errors';
import { logger } from '../logger';
import { enforceRateLimit } from '../ratelimit';

const log = logger('billing');

// ── Stripe client and configuration ─────────────────────────────────────────

let client: Stripe | undefined;

function stripe(): Stripe {
  if (client) return client;
  const e = env();
  if (!e.STRIPE_SECRET_KEY) throw new AppError('bad_request', 'Payments are not set up yet.');
  const config: Stripe.StripeConfig = { maxNetworkRetries: 2, timeout: 20_000 };
  if (e.STRIPE_API_URL) {
    // Tests point this at the fixture server instead of api.stripe.com.
    const url = new URL(e.STRIPE_API_URL);
    config.host = url.hostname;
    config.port = url.port || (url.protocol === 'https:' ? 443 : 80);
    config.protocol = url.protocol === 'https:' ? 'https' : 'http';
  }
  client = new Stripe(e.STRIPE_SECRET_KEY, config);
  return client;
}

function priceIds(): Record<PaidPlanId, Record<BillingInterval, string>> {
  const e = env();
  return {
    plus: { month: e.STRIPE_PRICE_PLUS_MONTHLY, year: e.STRIPE_PRICE_PLUS_YEARLY },
    pro: { month: e.STRIPE_PRICE_PRO_MONTHLY, year: e.STRIPE_PRICE_PRO_YEARLY },
  };
}

/** Whether payments are set up: a Stripe key and at least one plan price. */
export function billingEnabled(): boolean {
  const ids = priceIds();
  return Boolean(env().STRIPE_SECRET_KEY && PAID_PLAN_IDS.some((p) => ids[p].month || ids[p].year));
}

function priceFor(plan: PaidPlanId, interval: BillingInterval): string {
  const id = priceIds()[plan][interval];
  if (!id) throw new AppError('bad_request', 'That plan is not available right now.');
  return id;
}

function planForPrice(priceId: string): { plan: PaidPlanId; interval: BillingInterval } | null {
  const ids = priceIds();
  for (const plan of PAID_PLAN_IDS) {
    for (const interval of ['month', 'year'] as const) {
      if (ids[plan][interval] && ids[plan][interval] === priceId) return { plan, interval };
    }
  }
  return null;
}

export interface PlanPrice {
  /** In the smallest currency unit (cents). */
  amount: number;
  currency: string;
}
export type PlanPrices = Record<PaidPlanId, Record<BillingInterval, PlanPrice | null>>;

let priceCache: { at: number; prices: PlanPrices } | undefined;

/**
 * What each plan costs. Real prices come from Stripe (cached for ten minutes) so the store
 * always shows what will be charged; without Stripe it shows the list prices.
 */
export async function planPrices(): Promise<{ prices: PlanPrices; live: boolean }> {
  const list: PlanPrices = {
    plus: {
      month: { amount: PLAN_LIST_PRICES.plus.month, currency: PLAN_LIST_CURRENCY },
      year: { amount: PLAN_LIST_PRICES.plus.year, currency: PLAN_LIST_CURRENCY },
    },
    pro: {
      month: { amount: PLAN_LIST_PRICES.pro.month, currency: PLAN_LIST_CURRENCY },
      year: { amount: PLAN_LIST_PRICES.pro.year, currency: PLAN_LIST_CURRENCY },
    },
  };
  if (!billingEnabled()) return { prices: list, live: false };
  if (priceCache && Date.now() - priceCache.at < 600_000) {
    return { prices: priceCache.prices, live: true };
  }
  try {
    const ids = priceIds();
    const prices: PlanPrices = {
      plus: { month: null, year: null },
      pro: { month: null, year: null },
    };
    await Promise.all(
      PAID_PLAN_IDS.flatMap((plan) =>
        (['month', 'year'] as const).map(async (interval) => {
          const id = ids[plan][interval];
          if (!id) return;
          const p = await stripe().prices.retrieve(id);
          if (p.unit_amount != null) {
            prices[plan][interval] = { amount: p.unit_amount, currency: p.currency };
          }
        }),
      ),
    );
    priceCache = { at: Date.now(), prices };
    return { prices, live: true };
  } catch (err) {
    log.warn({ err }, 'could not load prices from Stripe');
    return { prices: list, live: false };
  }
}

// ── Plans and limits ────────────────────────────────────────────────────────

export async function communityPlan(communityId: string): Promise<PlanId> {
  const [row] = await db
    .select({ plan: schema.communities.plan })
    .from(schema.communities)
    .where(eq(schema.communities.id, communityId))
    .limit(1);
  return row?.plan ?? 'free';
}

export async function communityLimits(communityId: string) {
  return planLimits(await communityPlan(communityId));
}

const PLAN_NAMES: Record<PlanId, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' };

/** Refuse to go past a plan limit, pointing at an upgrade when there is one. */
export async function assertUnderPlanLimit(
  communityId: string,
  key: 'servers' | 'roles' | 'channels' | 'voiceChannels' | 'emoji',
  current: number,
  noun: string,
): Promise<void> {
  const plan = await communityPlan(communityId);
  const limit = planLimits(plan)[key];
  if (current < limit) return;
  if (limit === 0) {
    const needed = PLAN_IDS.find((p) => PLAN_LIMITS[p][key] > 0) ?? 'plus';
    throw new AppError(
      'forbidden',
      `${noun[0]!.toUpperCase()}${noun.slice(1)} need the ${PLAN_NAMES[needed]} plan. Upgrade in Plan & billing.`,
    );
  }
  const more = plan === 'pro' ? '' : ' Upgrade the plan in Plan & billing for more.';
  throw new AppError(
    'forbidden',
    `On the ${PLAN_NAMES[plan]} plan a community can have up to ${limit} ${noun}.${more}`,
  );
}

/** Refuse something that needs a paid plan's perk (e.g. separators) on a plan without it. */
export async function assertPlanPerk(
  communityId: string,
  perk: keyof PlanPerks,
  what: string,
): Promise<void> {
  const plan = await communityPlan(communityId);
  if (planPerks(plan)[perk]) return;
  throw new AppError(
    'forbidden',
    `${what} need the ${PLAN_NAMES[planFor(perk)]} plan. Upgrade in Plan & billing.`,
  );
}

/** A plan Magnox gave the community, if it's still running. */
async function activeGift(communityId: string) {
  const gift = await db.query.planGifts.findFirst({
    where: eq(schema.planGifts.communityId, communityId),
  });
  return gift && (!gift.expiresAt || gift.expiresAt > new Date()) ? gift : null;
}

/** Recompute a community's plan from its subscriptions (the best one that is still paid up). */
export async function syncCommunityPlan(communityId: string): Promise<PlanId> {
  const subs = await db
    .select({
      plan: schema.communitySubscriptions.plan,
      status: schema.communitySubscriptions.status,
    })
    .from(schema.communitySubscriptions)
    .where(eq(schema.communitySubscriptions.communityId, communityId));
  let plan: PlanId = 'free';
  for (const s of subs) {
    if (isActiveSubscriptionStatus(s.status) && planRank(s.plan) > planRank(plan)) plan = s.plan;
  }
  // A plan Magnox gave for free counts too, while it lasts (the better plan wins).
  const gift = await activeGift(communityId);
  if (gift && planRank(gift.plan) > planRank(plan)) plan = gift.plan;
  const changed = await db
    .update(schema.communities)
    .set({ plan })
    .where(and(eq(schema.communities.id, communityId), sql`${schema.communities.plan} <> ${plan}`))
    .returning({ id: schema.communities.id });
  if (changed.length) {
    log.info({ communityId, plan }, 'community plan changed');
    communityChanged(communityId, null);
  }
  return plan;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Store (or update) a subscription as Stripe describes it, then refresh the community's plan. */
async function saveSubscription(
  sub: Stripe.Subscription,
  hint: { communityId?: string | null; purchaserId?: string | null } = {},
): Promise<string | null> {
  const item = sub.items.data[0];
  const mapped = item ? planForPrice(item.price.id) : null;
  const plan = mapped?.plan ?? (isPaidPlanId(sub.metadata?.plan) ? sub.metadata.plan : null);
  const recurring = item?.price.recurring?.interval;
  const interval =
    mapped?.interval ??
    (isBillingInterval(recurring)
      ? recurring
      : isBillingInterval(sub.metadata?.interval)
        ? sub.metadata.interval
        : null);
  const communityId = sub.metadata?.communityId || hint.communityId || null;
  if (!plan || !interval || !communityId || !UUID_RE.test(communityId)) {
    log.warn({ subscription: sub.id }, 'subscription is not for a community plan; ignored');
    return null;
  }
  const community = await db.query.communities.findFirst({
    where: eq(schema.communities.id, communityId),
    columns: { id: true },
  });
  if (!community) {
    log.warn({ subscription: sub.id, communityId }, 'subscription for an unknown community');
    return null;
  }
  const purchaserId = sub.metadata?.purchaserId || hint.purchaserId || null;
  const purchaser = purchaserId
    ? await db.query.users.findFirst({
        where: eq(schema.users.id, purchaserId),
        columns: { id: true },
      })
    : undefined;
  const periodEnd = item?.current_period_end ?? null;
  const values = {
    plan,
    interval,
    status: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.communitySubscriptions)
    .values({
      id: newId(),
      communityId,
      purchaserId: purchaser?.id ?? null,
      stripeSubscriptionId: sub.id,
      ...values,
    })
    .onConflictDoUpdate({
      target: schema.communitySubscriptions.stripeSubscriptionId,
      set: values,
    });
  await syncCommunityPlan(communityId);
  return communityId;
}

// ── Webhooks ────────────────────────────────────────────────────────────────

/**
 * Handle a webhook from Stripe. The signature is checked against STRIPE_WEBHOOK_SECRET, each
 * event is handled once, and subscriptions are re-read from Stripe so events arriving out of
 * order can't leave an old state behind.
 */
export async function handleStripeWebhook(payload: string, signature: string | null) {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError('bad_request', 'Webhooks are not set up.');
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature ?? '', secret);
  } catch {
    throw new AppError('bad_request', 'Invalid signature.');
  }
  const fresh = await db
    .insert(schema.stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: schema.stripeEvents.id });
  if (!fresh.length) return { duplicate: true };
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const id =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          await saveSubscription(await stripe().subscriptions.retrieve(id), {
            communityId: session.client_reference_id,
            purchaserId: session.metadata?.purchaserId,
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await saveSubscription(await stripe().subscriptions.retrieve(event.data.object.id));
        break;
      default:
        break;
    }
  } catch (err) {
    // Forget the event so Stripe's retry is handled.
    await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.id, event.id));
    throw err;
  }
  return { duplicate: false };
}

// ── Buying and managing a plan ──────────────────────────────────────────────

async function activeSubscription(communityId: string) {
  const rows = await db
    .select()
    .from(schema.communitySubscriptions)
    .where(eq(schema.communitySubscriptions.communityId, communityId))
    .orderBy(desc(schema.communitySubscriptions.updatedAt));
  return rows.find((r) => isActiveSubscriptionStatus(r.status)) ?? null;
}

async function customerFor(userId: string): Promise<string> {
  const existing = await db.query.billingCustomers.findFirst({
    where: eq(schema.billingCustomers.userId, userId),
  });
  if (existing) return existing.stripeCustomerId;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new AppError('unauthorized', 'Please sign in to continue.');
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name, metadata: { userId } },
    { idempotencyKey: `customer-${userId}` },
  );
  await db
    .insert(schema.billingCustomers)
    .values({ userId, stripeCustomerId: customer.id })
    .onConflictDoNothing();
  const saved = await db.query.billingCustomers.findFirst({
    where: eq(schema.billingCustomers.userId, userId),
  });
  return saved!.stripeCustomerId;
}

function communityUrl(ctx: MemberContext, path: string): string {
  return `${env().APP_URL.replace(/\/$/, '')}/c/${ctx.community.slug}${path}`;
}

/** Start Stripe Checkout for a plan. Returns the Checkout page to send the buyer to. */
export async function createCheckout(
  ctx: MemberContext,
  input: { plan: unknown; interval: unknown },
): Promise<{ url: string }> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY, 'Only community managers can buy a plan.');
  if (!billingEnabled()) throw new AppError('bad_request', 'Payments are not set up yet.');
  if (!isPaidPlanId(input.plan) || !isBillingInterval(input.interval)) {
    throw new AppError('bad_request', 'Choose a plan.');
  }
  const userId = ctx.userId!;
  await enforceRateLimit(`checkout:${userId}`, 10, 600, 'Too many attempts. Try again soon.');
  if (await activeSubscription(ctx.community.id)) {
    throw new AppError(
      'conflict',
      'This community already has a plan. Change it from Plan & billing in its settings.',
    );
  }
  const metadata = {
    communityId: ctx.community.id,
    plan: input.plan,
    interval: input.interval,
    purchaserId: userId,
  };
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: await customerFor(userId),
    line_items: [{ price: priceFor(input.plan, input.interval), quantity: 1 }],
    client_reference_id: ctx.community.id,
    metadata,
    subscription_data: { metadata },
    allow_promotion_codes: true,
    success_url: communityUrl(ctx, '/settings/billing?checkout={CHECKOUT_SESSION_ID}'),
    cancel_url: `${env().APP_URL.replace(/\/$/, '')}/store?community=${ctx.community.slug}`,
  });
  if (!session.url) throw new AppError('bad_request', 'Stripe did not start checkout.');
  return { url: session.url };
}

/**
 * After Checkout sends the buyer back: record the subscription straight away rather than
 * waiting for the webhook. Returns whether the plan is on yet.
 */
export async function confirmCheckout(ctx: MemberContext, sessionId: string) {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  if (!billingEnabled() || !/^cs_[A-Za-z0-9_]{1,200}$/.test(sessionId)) return 'unknown' as const;
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    if (session.client_reference_id !== ctx.community.id) return 'unknown' as const;
    if (session.status !== 'complete' || !session.subscription) return 'pending' as const;
    const sub =
      typeof session.subscription === 'string'
        ? await stripe().subscriptions.retrieve(session.subscription)
        : session.subscription;
    await saveSubscription(sub, {
      communityId: ctx.community.id,
      purchaserId: session.metadata?.purchaserId,
    });
    return isActiveSubscriptionStatus(sub.status) ? ('active' as const) : ('pending' as const);
  } catch (err) {
    log.warn({ err, sessionId }, 'could not confirm checkout');
    return 'unknown' as const;
  }
}

async function ownSubscription(ctx: MemberContext) {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const sub = await activeSubscription(ctx.community.id);
  if (!sub) throw new AppError('bad_request', 'This community has no paid plan.');
  if (sub.purchaserId !== ctx.userId) {
    throw forbidden('Only the person who pays for this plan can change it.');
  }
  return sub;
}

/** Switch plan or billing interval (prorated), and undo any pending cancellation. */
export async function changePlan(
  ctx: MemberContext,
  input: { plan: unknown; interval: unknown },
): Promise<void> {
  if (!isPaidPlanId(input.plan) || !isBillingInterval(input.interval)) {
    throw new AppError('bad_request', 'Choose a plan.');
  }
  const own = await ownSubscription(ctx);
  const price = priceFor(input.plan, input.interval);
  const sub = await stripe().subscriptions.retrieve(own.stripeSubscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new AppError('bad_request', 'This plan cannot be changed here.');
  const updated = await stripe().subscriptions.update(sub.id, {
    items: [{ id: item.id, price }],
    proration_behavior: 'create_prorations',
    cancel_at_period_end: false,
    metadata: { ...sub.metadata, plan: input.plan, interval: input.interval },
  });
  await saveSubscription(updated);
}

/** Cancel at the end of the paid period, or undo that. */
export async function setPlanCancellation(ctx: MemberContext, cancel: boolean): Promise<void> {
  const own = await ownSubscription(ctx);
  const updated = await stripe().subscriptions.update(own.stripeSubscriptionId, {
    cancel_at_period_end: cancel,
  });
  await saveSubscription(updated);
}

/** Stripe's billing portal, for the payer's card details and invoices. */
export async function createBillingPortal(ctx: MemberContext): Promise<{ url: string }> {
  const own = await ownSubscription(ctx);
  const session = await stripe().billingPortal.sessions.create({
    customer: own.stripeCustomerId,
    return_url: communityUrl(ctx, '/settings/billing'),
  });
  return { url: session.url };
}

/** When a community is deleted, stop charging for it. */
export async function cancelCommunitySubscriptions(communityId: string): Promise<void> {
  if (!billingEnabled()) return;
  const subs = await db
    .select()
    .from(schema.communitySubscriptions)
    .where(eq(schema.communitySubscriptions.communityId, communityId));
  for (const s of subs.filter((r) => isActiveSubscriptionStatus(r.status))) {
    try {
      const canceled = await stripe().subscriptions.cancel(s.stripeSubscriptionId);
      await saveSubscription(canceled);
    } catch (err) {
      log.error({ err, subscription: s.stripeSubscriptionId }, 'could not cancel subscription');
    }
  }
}

// ── What the settings page and store show ───────────────────────────────────

export async function getBilling(ctx: MemberContext) {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const id = ctx.community.id;
  const count = (table: typeof schema.roles | typeof schema.channels) =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(eq(table.communityId, id))
      .then((r) => r[0]?.n ?? 0);
  const [plan, sub, gift, roles, channels, servers] = await Promise.all([
    communityPlan(id),
    activeSubscription(id),
    activeGift(id),
    count(schema.roles),
    count(schema.channels),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.gameServers)
      .where(and(eq(schema.gameServers.communityId, id), isNull(schema.gameServers.deletedAt)))
      .then((r) => r[0]?.n ?? 0),
  ]);
  const purchaser = sub?.purchaserId
    ? await db.query.users.findFirst({
        where: eq(schema.users.id, sub.purchaserId),
        columns: { name: true, username: true },
      })
    : null;
  return {
    enabled: billingEnabled(),
    plan,
    limits: planLimits(plan),
    usage: { servers, roles, channels },
    gift: gift ? { plan: gift.plan, expiresAt: gift.expiresAt?.toISOString() ?? null } : null,
    subscription: sub
      ? {
          plan: sub.plan,
          interval: sub.interval,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          mine: sub.purchaserId === ctx.userId,
          purchaser: purchaser ? { name: purchaser.name, username: purchaser.username } : null,
        }
      : null,
  };
}
export type BillingView = Awaited<ReturnType<typeof getBilling>>;

/** Communities someone can buy a plan for (they own it, or a role lets them manage it). */
export async function manageableCommunities(userId: string) {
  const flags = Permission.MANAGE_COMMUNITY | Permission.ADMINISTRATOR;
  const c = schema.communities;
  return db
    .select({ id: c.id, slug: c.slug, name: c.name, plan: c.plan })
    .from(c)
    .innerJoin(
      schema.members,
      and(eq(schema.members.communityId, c.id), eq(schema.members.userId, userId)),
    )
    .where(
      and(
        isNull(c.deletedAt),
        sql`(${c.ownerId} = ${userId} or exists (
          select 1 from ${schema.memberRoles} mr
          join ${schema.roles} r on r.id = mr.role_id
          where mr.community_id = ${c.id} and mr.user_id = ${userId}
            and (r.permissions & ${flags.toString()}::bigint) <> 0
        ) or exists (
          select 1 from ${schema.roles} r
          where r.community_id = ${c.id} and r.is_default
            and (r.permissions & ${flags.toString()}::bigint) <> 0
        ))`,
      ),
    )
    .orderBy(c.name)
    .limit(100);
}
