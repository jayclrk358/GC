import { index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tz } from './_helpers';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'nsfw',
  'violence',
  'misinformation',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type', {
      enum: ['post', 'thread', 'user', 'wiki_page', 'message'],
    }).notNull(),
    targetId: text('target_id').notNull(),
    /** Author of the reported content (or the reported user). */
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason', { enum: REPORT_REASONS }).notNull(),
    details: text('details').notNull().default(''),
    /** Snapshot of the content at report time. */
    excerpt: text('excerpt').notNull().default(''),
    status: text('status', { enum: ['open', 'resolved', 'dismissed'] })
      .notNull()
      .default('open'),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: tz('resolved_at'),
    resolution: text('resolution'),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_community_status_idx').on(t.communityId, t.status, t.id),
    index('reports_target_idx').on(t.targetType, t.targetId),
  ],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.blockedId] }),
    index('user_blocks_blocked_idx').on(t.blockedId),
  ],
);
