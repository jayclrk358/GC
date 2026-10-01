import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, tz } from './_helpers';

/** A browser or phone that asked for push notifications (Web Push). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent').notNull().default(''),
    /** Sends in a row that failed (not counting "gone", which removes it). */
    failures: integer('failures').notNull().default(0),
    lastSentAt: tz('last_sent_at'),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);
