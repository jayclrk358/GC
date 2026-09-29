import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { RichNode } from '@magnox/shared';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tsvector, tz } from './_helpers';

export const wikiPages = pgTable(
  'wiki_pages',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => wikiPages.id, {
      onDelete: 'set null',
    }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    /** Current content, denormalised from the latest revision for reading and search. */
    body: jsonb('body').$type<RichNode>().notNull(),
    bodyText: text('body_text').notNull().default(''),
    currentRevisionId: uuid('current_revision_id'),
    position: integer('position').notNull().default(0),
    /** Only members with Manage wiki can edit protected pages. */
    protected: boolean('protected').notNull().default(false),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    deletedAt: tz('deleted_at'),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(body_text, '')), 'B')`,
    ),
  },
  (t) => [
    uniqueIndex('wiki_pages_slug_idx').on(t.communityId, t.slug),
    index('wiki_pages_parent_idx').on(t.communityId, t.parentId, t.position),
    index('wiki_pages_search_idx').using('gin', t.search),
  ],
);

export const wikiRevisions = pgTable(
  'wiki_revisions',
  {
    id: uuid('id').primaryKey(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: jsonb('body').$type<RichNode>().notNull(),
    bodyText: text('body_text').notNull().default(''),
    summary: text('summary').notNull().default(''),
    /** Set when this revision restored an older one. */
    restoredFromId: uuid('restored_from_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('wiki_revisions_page_idx').on(t.pageId, t.id),
    // Someone's edits (checked before their images are deleted).
    index('wiki_revisions_author_idx').on(t.authorId),
  ],
);
