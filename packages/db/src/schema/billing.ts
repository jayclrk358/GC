import { boolean, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tz, updatedAt } from './_helpers';

/** A person's Stripe customer, reused for every plan they buy. */
export const billingCustomers = pgTable('billing_customers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  createdAt: createdAt(),
});

/**
 * A Stripe subscription that pays for a community's plan. Kept in step with Stripe by webhooks;
 * the community's effective plan (communities.plan) is derived from these rows.
 */
export const communitySubscriptions = pgTable(
  'community_subscriptions',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Who pays; only they can change or cancel it. */
    purchaserId: text('purchaser_id').references(() => users.id, { onDelete: 'set null' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    plan: text('plan', { enum: ['plus', 'pro'] }).notNull(),
    interval: text('interval', { enum: ['month', 'year'] }).notNull(),
    /** Stripe's status: active, trialing, past_due, canceled, incomplete, unpaid... */
    status: text('status').notNull(),
    currentPeriodEnd: tz('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('community_subscriptions_stripe_idx').on(t.stripeSubscriptionId),
    index('community_subscriptions_community_idx').on(t.communityId),
  ],
);

/** Stripe webhook events already handled, so a redelivered event is ignored. */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: tz('received_at').notNull().defaultNow(),
});
