import { boolean, index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tz } from './_helpers';

export const NOTIFICATION_TYPES = [
  'reply',
  'mention',
  'thread_reply',
  'solution',
  'wiki_edit',
  'report',
  'moderation',
  'role',
  'event',
  'application',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_TYPES }).notNull(),
    communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type'),
    targetId: text('target_id'),
    url: text('url').notNull(),
    /** Snapshot of what to show, so notifications survive edits and deletions. */
    data: jsonb('data')
      .$type<{ title?: string; excerpt?: string; community?: string }>()
      .notNull()
      .default({}),
    readAt: tz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.id)],
);

export const notificationSettings = pgTable('notification_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailMentions: boolean('email_mentions').notNull().default(true),
  emailReplies: boolean('email_replies').notNull().default(false),
  emailModeration: boolean('email_moderation').notNull().default(true),
  /** Event reminders, an hour before events you're going to. */
  emailEvents: boolean('email_events').notNull().default(true),
  /** Automatically follow threads you create or reply to. */
  autoFollow: boolean('auto_follow').notNull().default(true),
  /** An email round-up of unread notifications. */
  digest: text('digest', { enum: ['off', 'daily', 'weekly'] })
    .notNull()
    .default('off'),
  lastDigestAt: tz('last_digest_at'),
});

/** Mute a community, channel or thread (optionally until a time). */
export const mutes = pgTable(
  'mutes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: ['community', 'channel', 'thread'] }).notNull(),
    targetId: text('target_id').notNull(),
    until: tz('until'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);
