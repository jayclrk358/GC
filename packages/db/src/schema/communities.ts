import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { NameStyle, NavConfig, Onboarding, Theme } from '@magnox/shared';
import { users } from './auth';
import { games } from './games';
import { createdAt, tsvector, tz, updatedAt } from './_helpers';

export interface CommunitySettings {
  requireAltText?: boolean;
  welcomeMessage?: string;
  showMemberCount?: boolean;
  defaultChannelId?: string | null;
  serverAlertsChannelId?: string | null;
  /** Welcome steps for new members: a message, rules to accept, and roles to pick. */
  onboarding?: Onboarding;
}

export const communities = pgTable(
  'communities',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull().default(''),
    gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
    /** Where people can play the game (e.g. a Roblox experience); shown as a Play button. */
    playUrl: text('play_url'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    visibility: text('visibility', { enum: ['public', 'unlisted', 'private'] })
      .notNull()
      .default('public'),
    joinMode: text('join_mode', { enum: ['open', 'apply', 'invite'] })
      .notNull()
      .default('open'),
    nsfw: boolean('nsfw').notNull().default(false),
    region: text('region').notNull().default('global'),
    language: text('language').notNull().default('en'),
    tags: text('tags').array().notNull().default([]),
    template: text('template').notNull().default('fanhub'),
    theme: jsonb('theme').$type<Theme>().notNull(),
    nav: jsonb('nav').$type<NavConfig>().notNull(),
    settings: jsonb('settings').$type<CommunitySettings>().notNull().default({}),
    memberCount: integer('member_count').notNull().default(0),
    /** Effective plan, kept in step with community_subscriptions (see core billing). */
    plan: text('plan', { enum: ['free', 'plus', 'pro'] })
      .notNull()
      .default('free'),
    permVersion: integer('perm_version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Archived: kept and readable, but read-only, closed to new members and out of Explore. */
    archivedAt: tz('archived_at'),
    /** Taken offline by Magnox staff for breaking the rules (reversible). */
    suspendedAt: tz('suspended_at'),
    suspendReason: text('suspend_reason'),
    deletedAt: tz('deleted_at'),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(tagline, ''))`,
    ),
  },
  (t) => [
    uniqueIndex('communities_slug_idx').on(t.slug),
    index('communities_owner_idx').on(t.ownerId),
    index('communities_game_idx').on(t.gameId),
    index('communities_search_idx').using('gin', t.search),
    index('communities_tags_idx').using('gin', t.tags),
    index('communities_members_idx').on(t.memberCount),
  ],
);

export const members = pgTable(
  'members',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: text('nickname'),
    avatarKey: text('avatar_key'),
    joinedAt: tz('joined_at').notNull().defaultNow(),
    timeoutUntil: tz('timeout_until'),
    onboardedAt: tz('onboarded_at'),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.userId] }),
    // "Your communities" (newest first) and member lists (by join date), without sorting.
    index('members_user_idx').on(t.userId, t.joinedAt),
    index('members_community_joined_idx').on(t.communityId, t.joinedAt),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    icon: text('icon'),
    /** Uploaded role icon image, shown next to members' names. */
    iconKey: text('icon_key'),
    /** Nametag effect for members whose highest styled role this is. */
    nameStyle: jsonb('name_style')
      .$type<NameStyle>()
      .notNull()
      .default({ effect: 'none', color2: null, animation: 'none' }),
    /** How the role's own name looks on badges and labels (separate from members' names). */
    badgeStyle: jsonb('badge_style')
      .$type<NameStyle>()
      .notNull()
      .default({ effect: 'none', color2: null, animation: 'none' }),
    position: integer('position').notNull().default(0),
    permissions: bigint('permissions', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    isDefault: boolean('is_default').notNull().default(false),
    hoist: boolean('hoist').notNull().default(false),
    mentionable: boolean('mentionable').notNull().default(false),
    selfAssignable: boolean('self_assignable').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('roles_community_idx').on(t.communityId, t.position)],
);

export const memberRoles = pgTable(
  'member_roles',
  {
    communityId: uuid('community_id').notNull(),
    userId: text('user_id').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.userId, t.roleId] }),
    foreignKey({
      columns: [t.communityId, t.userId],
      foreignColumns: [members.communityId, members.userId],
      name: 'member_roles_member_fk',
    }).onDelete('cascade'),
    index('member_roles_role_idx').on(t.roleId),
  ],
);

export const invites = pgTable(
  'invites',
  {
    code: text('code').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
    maxUses: integer('max_uses').notNull().default(0),
    uses: integer('uses').notNull().default(0),
    expiresAt: tz('expires_at'),
    revokedAt: tz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [index('invites_community_idx').on(t.communityId)],
);

export const bans = pgTable(
  'bans',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull().default(''),
    bannedBy: text('banned_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: tz('expires_at'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.userId] })],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    diff: jsonb('diff').$type<Record<string, unknown>>(),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_community_idx').on(t.communityId, t.id)],
);

export const pageBlocks = pgTable(
  'page_blocks',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** Fractional index: blocks sort by this string. */
    position: text('position').notNull(),
    visible: boolean('visible').notNull().default(true),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [index('page_blocks_community_idx').on(t.communityId, t.position)],
);
