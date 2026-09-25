import { integer, pgTable, text } from 'drizzle-orm/pg-core';

export const games = pgTable('games', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Default server protocol key (see SERVER_PROTOCOLS), if the game has servers. */
  protocol: text('protocol'),
  steamAppId: integer('steam_app_id'),
  color: text('color'),
  aliases: text('aliases').array().notNull().default([]),
});
