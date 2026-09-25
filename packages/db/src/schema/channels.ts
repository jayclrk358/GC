import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { createdAt, tz } from './_helpers';

export const CHANNEL_TYPES = ['category', 'text', 'announcement', 'forum', 'wiki'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export interface ChannelSettings {
  /** Forum: allow up/down voting on threads. */
  voting?: boolean;
  /** Forum: Q&A mode, threads can have an accepted answer. */
  qa?: boolean;
  /** Forum: require a flair when posting. */
  requireFlair?: boolean;
  defaultSort?: 'latest' | 'top' | 'hot' | 'new' | 'unanswered';
  emoji?: string;
}

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => channels.id, {
      onDelete: 'set null',
    }),
    type: text('type', { enum: CHANNEL_TYPES }).notNull(),
    name: text('name').notNull(),
    topic: text('topic').notNull().default(''),
    position: integer('position').notNull().default(0),
    slowmodeSeconds: integer('slowmode_seconds').notNull().default(0),
    settings: jsonb('settings').$type<ChannelSettings>().notNull().default({}),
    lastMessageId: uuid('last_message_id'),
    lastActivityAt: tz('last_activity_at'),
    createdAt: createdAt(),
    archivedAt: tz('archived_at'),
  },
  (t) => [index('channels_community_idx').on(t.communityId, t.position)],
);

export const permissionOverwrites = pgTable(
  'permission_overwrites',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: ['role', 'member'] }).notNull(),
    /** Role uuid or user id. */
    targetId: text('target_id').notNull(),
    allow: bigint('allow', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    deny: bigint('deny', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.targetType, t.targetId] })],
);
