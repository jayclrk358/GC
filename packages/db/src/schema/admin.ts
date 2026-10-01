import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tz } from './_helpers';

/** A paid plan Magnox gave a community for free: for a while, or for good (no expiry). */
export const planGifts = pgTable(
  'plan_gifts',
  {
    communityId: uuid('community_id')
      .primaryKey()
      .references(() => communities.id, { onDelete: 'cascade' }),
    plan: text('plan', { enum: ['plus', 'pro'] }).notNull(),
    /** Null: for good. */
    expiresAt: tz('expires_at'),
    note: text('note').notNull().default(''),
    grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('plan_gifts_expires_idx').on(t.expiresAt)],
);

/** What platform admins did, for the record. */
export const adminActions = pgTable(
  'admin_actions',
  {
    id: uuid('id').primaryKey(),
    adminId: text('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type', { enum: ['community', 'user'] }).notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('admin_actions_created_idx').on(t.createdAt)],
);
