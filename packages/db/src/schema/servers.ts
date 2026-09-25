import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { games } from './games';
import { createdAt, tz, updatedAt } from './_helpers';

/**
 * What actually gets polled. Many listings can point at one endpoint, so each address is only
 * ever queried once per interval no matter how many times it is registered.
 */
export const serverEndpoints = pgTable(
  'server_endpoints',
  {
    id: uuid('id').primaryKey(),
    protocol: text('protocol').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    resolvedIp: text('resolved_ip'),
    online: boolean('online').notNull().default(false),
    players: integer('players'),
    maxPlayers: integer('max_players'),
    map: text('map'),
    version: text('version'),
    reportedName: text('reported_name'),
    pingMs: integer('ping_ms'),
    lastCheckedAt: tz('last_checked_at'),
    lastOnlineAt: tz('last_online_at'),
    failCount: integer('fail_count').notNull().default(0),
    nextPollAt: tz('next_poll_at').notNull().defaultNow(),
    hotUntil: tz('hot_until'),
    dormant: boolean('dormant').notNull().default(false),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('server_endpoints_addr_idx').on(t.protocol, t.host, t.port),
    index('server_endpoints_next_poll_idx').on(t.nextPollAt),
    index('server_endpoints_ip_idx').on(t.resolvedIp),
  ],
);

export const gameServers = pgTable(
  'game_servers',
  {
    id: uuid('id').primaryKey(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => serverEndpoints.id, { onDelete: 'restrict' }),
    communityId: uuid('community_id').references(() => communities.id, { onDelete: 'set null' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    tags: text('tags').array().notNull().default([]),
    region: text('region').notNull().default('global'),
    listed: boolean('listed').notNull().default(true),
    verifyToken: text('verify_token').notNull(),
    verifiedAt: tz('verified_at'),
    voteCount: integer('vote_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz('deleted_at'),
  },
  (t) => [
    index('game_servers_community_idx').on(t.communityId),
    index('game_servers_owner_idx').on(t.ownerId),
    index('game_servers_endpoint_idx').on(t.endpointId),
  ],
);
