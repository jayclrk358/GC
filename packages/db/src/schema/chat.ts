import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { RichNode } from '@magnox/shared';
import { users } from './auth';
import { channels } from './channels';
import { communities } from './communities';
import { createdAt, tsvector, tz } from './_helpers';

/** An image attached to a chat message (always an upload re-encoded by the image pipeline). */
export interface MessageAttachment {
  key: string;
  alt: string;
  width: number;
  height: number;
  animated: boolean;
  posterKey: string | null;
}

/** A link preview, fetched by the worker behind the SSRF guard. Images are re-hosted. */
export interface MessageEmbed {
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageKey: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

export const messages = pgTable(
  'messages',
  {
    /** UUIDv7: sorts by time, so keyset pagination works on the primary key. */
    id: uuid('id').primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: jsonb('body').$type<RichNode>().notNull(),
    content: text('content').notNull().default(''),
    replyToId: uuid('reply_to_id'),
    mentionUserIds: text('mention_user_ids')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    mentionRoleIds: uuid('mention_role_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    mentionEveryone: boolean('mention_everyone').notNull().default(false),
    attachments: jsonb('attachments').$type<MessageAttachment[]>().notNull().default([]),
    embeds: jsonb('embeds').$type<MessageEmbed[]>().notNull().default([]),
    /** Client-generated id so a retried send isn't posted twice. */
    nonce: text('nonce'),
    pinnedAt: tz('pinned_at'),
    pinnedBy: text('pinned_by'),
    editedAt: tz('edited_at'),
    deletedAt: tz('deleted_at'),
    createdAt: createdAt(),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple'::regconfig, coalesce(content, ''))`,
    ),
  },
  (t) => [
    index('messages_channel_idx').on(t.channelId, t.id),
    index('messages_community_idx').on(t.communityId, t.id),
    index('messages_author_idx').on(t.authorId, t.id),
    index('messages_search_idx').using('gin', t.search),
    index('messages_mention_users_idx').using('gin', t.mentionUserIds),
    index('messages_mention_roles_idx').using('gin', t.mentionRoleIds),
    index('messages_pinned_idx')
      .on(t.channelId, t.pinnedAt)
      .where(sql`pinned_at is not null`),
    uniqueIndex('messages_nonce_idx')
      .on(t.authorId, t.nonce)
      .where(sql`nonce is not null`),
  ],
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/** Where each person has read up to in each channel. Unread and mention counts derive from it. */
export const readStates = pgTable(
  'read_states',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    lastReadId: uuid('last_read_id'),
    updatedAt: tz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channelId] })],
);

export interface LinkPreviewData {
  title: string;
  description: string;
  siteName: string;
  imageKey: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

/** Cache of fetched link previews, keyed by a hash of the URL. */
export const linkPreviews = pgTable('link_previews', {
  urlHash: text('url_hash').primaryKey(),
  url: text('url').notNull(),
  ok: boolean('ok').notNull(),
  data: jsonb('data').$type<LinkPreviewData | null>(),
  fetchedAt: tz('fetched_at').notNull().defaultNow(),
});
