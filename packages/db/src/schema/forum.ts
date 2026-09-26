import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import type { RichNode } from '@magnox/shared';
import { users } from './auth';
import { channels } from './channels';
import { communities } from './communities';
import { createdAt, tsvector, tz } from './_helpers';

export const flairs = pgTable(
  'flairs',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Null = available in every forum channel. */
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    modOnly: boolean('mod_only').notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('flairs_community_idx').on(t.communityId)],
);

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    flairId: uuid('flair_id').references(() => flairs.id, { onDelete: 'set null' }),
    pinned: boolean('pinned').notNull().default(false),
    locked: boolean('locked').notNull().default(false),
    score: integer('score').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    solutionPostId: uuid('solution_post_id'),
    lastPostId: uuid('last_post_id'),
    lastActivityAt: tz('last_activity_at').notNull().defaultNow(),
    createdAt: createdAt(),
    deletedAt: tz('deleted_at'),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple'::regconfig, coalesce(title, ''))`,
    ),
  },
  (t) => [
    index('threads_channel_activity_idx').on(t.channelId, t.pinned, t.lastActivityAt),
    index('threads_community_idx').on(t.communityId, t.lastActivityAt),
    index('threads_author_idx').on(t.authorId),
    index('threads_search_idx').using('gin', t.search),
  ],
);

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** The opening post of the thread. */
    isOp: boolean('is_op').notNull().default(false),
    body: jsonb('body').$type<RichNode>().notNull(),
    bodyText: text('body_text').notNull().default(''),
    replyToId: uuid('reply_to_id'),
    createdAt: createdAt(),
    editedAt: tz('edited_at'),
    deletedAt: tz('deleted_at'),
    deletedBy: text('deleted_by'),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple'::regconfig, coalesce(body_text, ''))`,
    ),
  },
  (t) => [
    index('posts_thread_idx').on(t.threadId, t.id),
    index('posts_author_idx').on(t.authorId),
    index('posts_search_idx').using('gin', t.search),
  ],
);

export const postRevisions = pgTable(
  'post_revisions',
  {
    id: uuid('id').primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    editorId: text('editor_id').references(() => users.id, { onDelete: 'set null' }),
    body: jsonb('body').$type<RichNode>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('post_revisions_post_idx').on(t.postId)],
);

export const postReactions = pgTable(
  'post_reactions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId, t.emoji] }),
    index('post_reactions_post_idx').on(t.postId),
  ],
);

export const threadVotes = pgTable(
  'thread_votes',
  {
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

export interface PollOption {
  id: string;
  label: string;
}

export const polls = pgTable('polls', {
  id: uuid('id').primaryKey(),
  threadId: uuid('thread_id')
    .notNull()
    .unique()
    .references(() => threads.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  options: jsonb('options').$type<PollOption[]>().notNull(),
  multiple: boolean('multiple').notNull().default(false),
  closesAt: tz('closes_at'),
  createdAt: createdAt(),
});

export const pollVotes = pgTable(
  'poll_votes',
  {
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    optionId: text('option_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId, t.optionId] })],
);

/** Who gets notified about new replies in a thread. */
export const threadFollows = pgTable(
  'thread_follows',
  {
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.userId] }),
    index('thread_follows_user_idx').on(t.userId),
  ],
);

/** Last-read marker per user per thread, for "new replies" indicators. */
export const threadReads = pgTable(
  'thread_reads',
  {
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadPostId: uuid('last_read_post_id'),
    readAt: tz('read_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);
