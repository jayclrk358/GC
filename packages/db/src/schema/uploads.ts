import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { createdAt } from './_helpers';

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull().unique(),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    communityId: uuid('community_id').references(() => communities.id, { onDelete: 'set null' }),
    purpose: text('purpose').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    animated: boolean('animated').notNull().default(false),
    /** Static first frame for animated images (used when a user disables animation). */
    posterKey: text('poster_key'),
    alt: text('alt').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('uploads_owner_idx').on(t.ownerId)],
);
