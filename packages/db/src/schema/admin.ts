import { boolean, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES } from '@magnox/shared';
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
    targetType: text('target_type', {
      enum: ['community', 'user', 'message', 'post', 'thread', 'feedback'],
    }).notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('admin_actions_created_idx').on(t.createdAt)],
);

/** Something someone told Magnox's team: a bug, an idea or request, a question. */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: FEEDBACK_KINDS }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** The page they were on when they wrote it (a path on this site). */
    page: text('page'),
    /** Their browser, for bugs. */
    userAgent: text('user_agent'),
    status: text('status', { enum: FEEDBACK_STATUSES }).notNull().default('new'),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('feedback_status_idx').on(t.status, t.createdAt),
    index('feedback_user_idx').on(t.userId, t.createdAt),
  ],
);

/** The conversation on a piece of feedback: replies both ways, and staff-only notes. */
export const feedbackMessages = pgTable(
  'feedback_messages',
  {
    id: uuid('id').primaryKey(),
    feedbackId: uuid('feedback_id')
      .notNull()
      .references(() => feedback.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** Written by Magnox staff (shown as "Magnox team" to the person who sent it). */
    fromStaff: boolean('from_staff').notNull().default(false),
    /** Staff-only note, never shown to the person who sent it. */
    internal: boolean('internal').notNull().default(false),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('feedback_messages_feedback_idx').on(t.feedbackId, t.createdAt)],
);
