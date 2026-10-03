import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tz } from './_helpers';

/** Personal API tokens for the public API (only a hash is kept; the token is shown once). */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** SHA-256 of the token. */
    tokenHash: text('token_hash').notNull().unique(),
    /** The token's first characters, to tell tokens apart. */
    prefix: text('prefix').notNull(),
    /** "read", and "write" to post as the person. */
    scopes: text('scopes').array().notNull().default(['read']),
    lastUsedAt: tz('last_used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('api_tokens_user_idx').on(t.userId)],
);

/** Where a community sends news of what happens in it: any URL (signed JSON) or a Discord webhook. */
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** "json": signed JSON for your own code; "discord": messages in a Discord channel. */
    kind: text('kind', { enum: ['json', 'discord'] }).notNull(),
    events: text('events').array().notNull(),
    /** For signing JSON deliveries (HMAC-SHA256). */
    secret: text('secret').notNull(),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastStatus: integer('last_status'),
    lastError: text('last_error'),
    lastDeliveredAt: tz('last_delivered_at'),
    /** Failed deliveries in a row; at 20 the webhook is switched off. */
    failures: integer('failures').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('webhooks_community_idx').on(t.communityId)],
);

/** A community's own domain for its public pages, once its DNS proves it's theirs. */
export const customDomains = pgTable('custom_domains', {
  communityId: uuid('community_id')
    .primaryKey()
    .references(() => communities.id, { onDelete: 'cascade' }),
  /** Lowercase, no trailing dot. */
  domain: text('domain').notNull().unique(),
  /** Goes in a TXT record at _gamecentral.<domain>. */
  verifyToken: text('verify_token').notNull(),
  verifiedAt: tz('verified_at'),
  lastCheckedAt: tz('last_checked_at'),
  lastError: text('last_error'),
  createdAt: createdAt(),
});
