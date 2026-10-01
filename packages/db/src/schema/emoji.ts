import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { createdAt } from './_helpers';

/** A community's own emoji: small images used in posts and as reactions as :name:. */
export const customEmoji = pgTable(
  'custom_emoji',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    imageKey: text('image_key').notNull(),
    creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('custom_emoji_name_idx').on(t.communityId, t.name),
    index('custom_emoji_image_idx').on(t.imageKey),
  ],
);
