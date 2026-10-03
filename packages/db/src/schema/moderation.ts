import { index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import type { AutomodConfig, AutomodRule } from '@gamecentral/shared';
import { users } from './auth';
import { channels } from './channels';
import { communities } from './communities';
import { createdAt, tz, updatedAt } from './_helpers';

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

/** A community's automod rules, and whether joining is paused after a rush of joins. */
export const automodSettings = pgTable('automod_settings', {
  communityId: uuid('community_id')
    .primaryKey()
    .references(() => communities.id, { onDelete: 'cascade' }),
  config: jsonb('config').$type<AutomodConfig>().notNull(),
  /** Joining is paused until then (raid protection). */
  joinsPausedUntil: tz('joins_paused_until'),
  updatedAt: updatedAt(),
});

/** Posts automod held back for a moderator to approve or reject (the mod queue). */
export const heldPosts = pgTable(
  'held_posts',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['message', 'thread', 'reply'] }).notNull(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    /** For replies. */
    threadId: uuid('thread_id'),
    /** What was sent, to post as it was if approved. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Thread title (for new threads). */
    title: text('title'),
    text: text('text').notNull().default(''),
    rule: text('rule').$type<AutomodRule>().notNull(),
    /** What matched (a word or a site). */
    match: text('match'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: tz('reviewed_at'),
    /** The post made on approval. */
    resultId: text('result_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('held_posts_queue_idx').on(t.communityId, t.status, t.createdAt),
    index('held_posts_author_idx').on(t.authorId),
  ],
);
