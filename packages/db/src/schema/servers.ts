import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { communities } from './communities';
import { games } from './games';
import { channels } from './channels';
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
    /** Set when the endpoint was declared down (after repeated failures) and alerts went out. */
    downSince: tz('down_since'),
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
    /** Chat channel (in the same community) that gets "down" and "back up" alerts. */
    alertChannelId: uuid('alert_channel_id').references(() => channels.id, {
      onDelete: 'set null',
    }),
    /** Votifier (Minecraft vote rewards): NuVotifier v2 token or legacy v1 RSA public key. */
    votifierHost: text('votifier_host'),
    votifierPort: integer('votifier_port'),
    votifierToken: text('votifier_token'),
    votifierPublicKey: text('votifier_public_key'),
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

/**
 * One row per poll. Partitioned by day (see migration 0005); the worker creates partitions ahead
 * of time and drops ones older than a week, so raw samples never pile up.
 */
export const serverSamples = pgTable(
  'server_samples',
  {
    endpointId: uuid('endpoint_id').notNull(),
    ts: tz('ts').notNull(),
    online: boolean('online').notNull(),
    players: integer('players'),
    pingMs: integer('ping_ms'),
  },
  (t) => [primaryKey({ columns: [t.endpointId, t.ts] })],
);

const rollupColumns = {
  endpointId: uuid('endpoint_id')
    .notNull()
    .references(() => serverEndpoints.id, { onDelete: 'cascade' }),
  samples: integer('samples').notNull(),
  onlineSamples: integer('online_samples').notNull(),
  avgPlayers: real('avg_players'),
  peakPlayers: integer('peak_players'),
};

/** Hourly summaries, kept for a year. */
export const serverRollupsHourly = pgTable(
  'server_rollups_hourly',
  { ...rollupColumns, hour: tz('hour').notNull() },
  (t) => [primaryKey({ columns: [t.endpointId, t.hour] })],
);

/** Daily summaries, kept forever. */
export const serverRollupsDaily = pgTable(
  'server_rollups_daily',
  { ...rollupColumns, day: date('day').notNull() },
  (t) => [primaryKey({ columns: [t.endpointId, t.day] })],
);

export const serverVotes = pgTable(
  'server_votes',
  {
    id: uuid('id').primaryKey(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => gameServers.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** In-game name, for vote rewards (Votifier). */
    username: text('username'),
    /** Votifier delivery: null (not needed), 'pending', 'sent' or 'failed'. */
    reward: text('reward'),
    createdAt: createdAt(),
  },
  (t) => [
    index('server_votes_server_idx').on(t.serverId, t.createdAt),
    index('server_votes_user_idx').on(t.userId, t.serverId, t.createdAt),
  ],
);
