import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  ALL_PERMISSIONS,
  applyTimeout,
  computeBasePermissions,
  computeChannelPermissions,
  has,
  isUuid,
  Permission,
  type Overwrite,
} from '@magnox/shared';
import { forbidden, notFound, unauthorized } from './errors';

export interface CommunityRef {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  visibility: 'public' | 'unlisted' | 'private';
  joinMode: 'open' | 'apply' | 'invite';
  permVersion: number;
  deletedAt: Date | null;
  /** New members can only read until they accept the rules (welcome steps). */
  rulesGate: boolean;
  /** Archived: read-only for everyone but administrators, and closed to new members. */
  archived: boolean;
}

export interface MemberContext {
  community: CommunityRef;
  userId: string | null;
  isMember: boolean;
  isOwner: boolean;
  banned: boolean;
  timedOut: boolean;
  timeoutUntil: Date | null;
  /** A member who hasn't accepted the rules yet, where that's required: read-only until then. */
  needsRules: boolean;
  everyoneRoleId: string;
  roleIds: string[];
  /** Highest role position the member holds (owner = Infinity). */
  topPosition: number;
  /** Community-level permissions, timeout already applied. */
  base: bigint;
}

/** What visitors (signed out or not a member) may do in a community they can see. */
const GUEST_MASK = Permission.VIEW_CHANNEL | Permission.READ_HISTORY;

export function canView(
  community: Pick<CommunityRef, 'visibility' | 'deletedAt'>,
  isMember: boolean,
) {
  if (community.deletedAt) return false;
  return community.visibility !== 'private' || isMember;
}

async function loadCommunity(where: { id?: string; slug?: string }): Promise<CommunityRef | null> {
  // Postgres rejects a malformed uuid outright (an error, not "no such row").
  if (where.id !== undefined && !isUuid(where.id)) return null;
  const cond = where.id
    ? eq(schema.communities.id, where.id)
    : eq(schema.communities.slug, (where.slug ?? '').toLowerCase());
  const row = await db
    .select({
      id: schema.communities.id,
      slug: schema.communities.slug,
      name: schema.communities.name,
      ownerId: schema.communities.ownerId,
      visibility: schema.communities.visibility,
      joinMode: schema.communities.joinMode,
      permVersion: schema.communities.permVersion,
      // Suspended by Magnox staff counts as gone, everywhere (pages, APIs, sockets).
      deletedAt:
        sql<Date | null>`coalesce(${schema.communities.deletedAt}, ${schema.communities.suspendedAt})`.mapWith(
          schema.communities.deletedAt,
        ),
      archived: sql<boolean>`${schema.communities.archivedAt} is not null`,
      rulesGate: sql<boolean>`coalesce((${schema.communities.settings} #>> '{onboarding,enabled}')::boolean and (${schema.communities.settings} #>> '{onboarding,requireAccept}')::boolean, false)`,
    })
    .from(schema.communities)
    .where(cond)
    .limit(1);
  return row[0] ?? null;
}

export async function memberContextFor(
  community: CommunityRef,
  userId: string | null,
): Promise<MemberContext> {
  const roles = await db
    .select({
      id: schema.roles.id,
      permissions: schema.roles.permissions,
      isDefault: schema.roles.isDefault,
      position: schema.roles.position,
    })
    .from(schema.roles)
    .where(eq(schema.roles.communityId, community.id));
  const everyone = roles.find((r) => r.isDefault);
  if (!everyone) throw new Error(`Community ${community.id} has no @everyone role`);

  let member: { timeoutUntil: Date | null; onboardedAt: Date | null } | undefined;
  let roleIds: string[] = [];
  let banned = false;
  if (userId) {
    const [m, mr, ban] = await Promise.all([
      db
        .select({
          timeoutUntil: schema.members.timeoutUntil,
          onboardedAt: schema.members.onboardedAt,
        })
        .from(schema.members)
        .where(and(eq(schema.members.communityId, community.id), eq(schema.members.userId, userId)))
        .limit(1),
      db
        .select({ roleId: schema.memberRoles.roleId })
        .from(schema.memberRoles)
        .where(
          and(
            eq(schema.memberRoles.communityId, community.id),
            eq(schema.memberRoles.userId, userId),
          ),
        ),
      db
        .select({ expiresAt: schema.bans.expiresAt })
        .from(schema.bans)
        .where(and(eq(schema.bans.communityId, community.id), eq(schema.bans.userId, userId)))
        .limit(1),
    ]);
    member = m[0];
    roleIds = member ? mr.map((r) => r.roleId) : [];
    banned = Boolean(ban[0] && (!ban[0].expiresAt || ban[0].expiresAt > new Date()));
  }

  const isOwner = userId !== null && userId === community.ownerId;
  const isMember = Boolean(member) || isOwner;
  const heldRoles = roles.filter((r) => roleIds.includes(r.id));
  const timedOut = Boolean(member?.timeoutUntil && member.timeoutUntil > new Date());
  const needsRules = Boolean(member && !isOwner && community.rulesGate && !member.onboardedAt);

  let base: bigint;
  if (banned) base = 0n;
  else if (!isMember) base = canView(community, false) ? everyone.permissions & GUEST_MASK : 0n;
  else {
    base = computeBasePermissions({
      isOwner,
      everyone: everyone.permissions,
      roles: heldRoles.map((r) => r.permissions),
    });
    // Timed out, still to accept the rules, or archived: read only (administrators are exempt).
    base = applyTimeout(base, timedOut || needsRules || community.archived);
  }

  return {
    community,
    userId,
    isMember,
    isOwner,
    banned,
    timedOut,
    timeoutUntil: member?.timeoutUntil ?? null,
    needsRules,
    everyoneRoleId: everyone.id,
    roleIds,
    topPosition: isOwner
      ? Number.POSITIVE_INFINITY
      : Math.max(0, ...heldRoles.map((r) => r.position)),
    base,
  };
}

/** Load a community and the viewer's permissions in it. Throws not_found if they can't see it. */
export async function getMemberContext(
  ref: { id?: string; slug?: string },
  userId: string | null,
): Promise<MemberContext> {
  const community = await loadCommunity(ref);
  if (!community) throw notFound('Community');
  const ctx = await memberContextFor(community, userId);
  if (!canView(community, ctx.isMember) || ctx.banned) {
    // Don't reveal that a private community exists.
    throw notFound('Community');
  }
  return ctx;
}

export function hasPerm(ctx: MemberContext, flag: bigint): boolean {
  return has(ctx.base, flag);
}

export function requirePerm(ctx: MemberContext, flag: bigint, message?: string): void {
  if (!ctx.userId) throw unauthorized();
  if (!has(ctx.base, flag)) throw forbidden(message);
}

export function requireMember(ctx: MemberContext): void {
  if (!ctx.userId) throw unauthorized();
  if (!ctx.isMember) throw forbidden('Join this community first.');
}

export interface ChannelRef {
  id: string;
  communityId: string;
  parentId: string | null;
  type: string;
}

async function overwritesFor(channelIds: string[]): Promise<Map<string, Overwrite[]>> {
  const map = new Map<string, Overwrite[]>();
  if (channelIds.length === 0) return map;
  const rows = await db
    .select()
    .from(schema.permissionOverwrites)
    .where(inArray(schema.permissionOverwrites.channelId, channelIds));
  for (const r of rows) {
    const list = map.get(r.channelId) ?? [];
    list.push({ targetType: r.targetType, targetId: r.targetId, allow: r.allow, deny: r.deny });
    map.set(r.channelId, list);
  }
  return map;
}

/** The channels and categories whose overwrites apply to these channels. */
function overwriteLayers(channels: ChannelRef[]): string[] {
  const ids = new Set<string>();
  for (const c of channels) {
    ids.add(c.id);
    if (c.parentId) ids.add(c.parentId);
  }
  return [...ids];
}

/** Channel permissions from overwrites already loaded (category first, then the channel). */
function permissionsWith(
  ctx: MemberContext,
  channel: ChannelRef,
  ow: Map<string, Overwrite[]>,
): bigint {
  if (ctx.base === ALL_PERMISSIONS) return ALL_PERMISSIONS;
  const layerIds = channel.parentId ? [channel.parentId, channel.id] : [channel.id];
  const perms = computeChannelPermissions({
    base: ctx.base,
    everyoneRoleId: ctx.everyoneRoleId,
    memberRoleIds: ctx.roleIds,
    userId: ctx.userId ?? '',
    layers: layerIds.map((id) => ow.get(id) ?? []),
    timedOut: ctx.timedOut || ctx.needsRules || ctx.community.archived,
  });
  return ctx.isMember ? perms : perms & GUEST_MASK;
}

/** Channel-level permissions for the viewer, including category and channel overwrites. */
export async function channelPermissions(ctx: MemberContext, channel: ChannelRef): Promise<bigint> {
  if (ctx.base === ALL_PERMISSIONS) return ALL_PERMISSIONS;
  return permissionsWith(ctx, channel, await overwritesFor(overwriteLayers([channel])));
}

/** Permissions for many channels at once (for sidebars). */
export async function channelPermissionsMany(
  ctx: MemberContext,
  channels: ChannelRef[],
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  if (ctx.base === ALL_PERMISSIONS) {
    for (const c of channels) out.set(c.id, ALL_PERMISSIONS);
    return out;
  }
  const ow = await overwritesFor(overwriteLayers(channels));
  for (const c of channels) out.set(c.id, permissionsWith(ctx, c, ow));
  return out;
}

const channelRefColumns = {
  id: schema.channels.id,
  communityId: schema.channels.communityId,
  parentId: schema.channels.parentId,
  type: schema.channels.type,
};

export async function loadChannel(id: string): Promise<ChannelRef | null> {
  if (!isUuid(id)) return null;
  const rows = await db
    .select(channelRefColumns)
    .from(schema.channels)
    .where(eq(schema.channels.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Member contexts for room checks, kept for a few seconds: opening chat subscribes to every
 * channel at once, and each would otherwise work out the same member's roles again. Only used
 * for subscribing (reading); anything that changes data checks afresh.
 */
const SUBSCRIBE_CTX_MS = 5_000;
const subscribeCtx = new Map<string, { at: number; ctx: Promise<MemberContext> }>();

function memberContextForRooms(communityId: string, userId: string | null) {
  const key = `${communityId}|${userId ?? ''}`;
  const hit = subscribeCtx.get(key);
  if (hit && Date.now() - hit.at < SUBSCRIBE_CTX_MS) return hit.ctx;
  const ctx = getMemberContext({ id: communityId }, userId);
  subscribeCtx.set(key, { at: Date.now(), ctx });
  // Only members are remembered: someone who has just joined must be checked afresh.
  ctx.then(
    (c) => !c.isMember && subscribeCtx.delete(key),
    () => subscribeCtx.delete(key),
  );
  // Oldest first (insertion order): keep the map small on a busy server.
  if (subscribeCtx.size > 5000) {
    for (const k of [...subscribeCtx.keys()].slice(0, 1000)) subscribeCtx.delete(k);
  }
  return ctx;
}

/**
 * Forget cached member contexts in a community (only one person's, with `userId`) once access
 * there has changed, so the next subscribe is checked against the change.
 */
export function forgetRoomAccess(communityId: string, userId: string | null): void {
  if (userId !== null) {
    subscribeCtx.delete(`${communityId}|${userId}`);
    return;
  }
  for (const key of subscribeCtx.keys()) {
    if (key.startsWith(`${communityId}|`)) subscribeCtx.delete(key);
  }
}

/** A room someone may join, and the community it belongs to (none for game server status). */
export interface RoomGrant {
  communityId: string | null;
}

/** Where a community's room lives, and the channel that decides who sees it (none: everyone). */
async function roomTarget(
  kind: string,
  id: string,
): Promise<{ communityId: string; channel: ChannelRef | null } | null> {
  switch (kind) {
    case 'community':
      return isUuid(id) ? { communityId: id, channel: null } : null;
    case 'channel':
    case 'chat': {
      const channel = await loadChannel(id);
      return channel && { communityId: channel.communityId, channel };
    }
    case 'thread': {
      if (!isUuid(id)) return null;
      const [t] = await db
        .select({
          communityId: schema.threads.communityId,
          channelId: schema.threads.channelId,
          deletedAt: schema.threads.deletedAt,
        })
        .from(schema.threads)
        .where(eq(schema.threads.id, id))
        .limit(1);
      if (!t || t.deletedAt) return null;
      const channel = await loadChannel(t.channelId);
      return channel && { communityId: t.communityId, channel };
    }
    default:
      return null;
  }
}

/**
 * Room authorization for the realtime server: what the room belongs to, or null if the user may
 * not join it.
 */
export async function canSubscribe(
  userId: string | null,
  kind: string,
  id: string,
): Promise<RoomGrant | null> {
  // Server status is public (and an unknown id just never gets an update), so there's nothing
  // to look up.
  if (kind === 'server') return isUuid(id) ? { communityId: null } : null;
  const target = await roomTarget(kind, id);
  if (!target) return null;
  try {
    const ctx = await memberContextForRooms(target.communityId, userId);
    if (target.channel) {
      const perms = await channelPermissions(ctx, target.channel);
      if (!has(perms, Permission.VIEW_CHANNEL)) return null;
    }
    return { communityId: target.communityId };
  } catch {
    return null;
  }
}

/**
 * After access in a community may have shrunk (kicked, banned, roles or overwrites changed, made
 * private, suspended): of the rooms each socket joined there, the ones it must leave. Worked out
 * afresh rather than from the subscribe cache, loading the community's channels once for all.
 */
export async function revokedRooms(
  communityId: string,
  sockets: { userId: string | null; rooms: string[] }[],
): Promise<string[][]> {
  const community = await loadCommunity({ id: communityId });
  // Deleted or suspended: nobody keeps anything there.
  if (!community || community.deletedAt) return sockets.map((s) => s.rooms);

  const joined = sockets.flatMap((s) => s.rooms.map((room) => room.split(':') as [string, string]));
  const idsOf = (kinds: string[]) => [
    ...new Set(joined.filter(([k, id]) => kinds.includes(k) && isUuid(id)).map(([, id]) => id)),
  ];
  const threadIds = idsOf(['thread']);
  const threads = threadIds.length
    ? await db
        .select({ id: schema.threads.id, channelId: schema.threads.channelId })
        .from(schema.threads)
        .where(
          and(
            inArray(schema.threads.id, threadIds),
            eq(schema.threads.communityId, communityId),
            isNull(schema.threads.deletedAt),
          ),
        )
    : [];
  const threadChannel = new Map(threads.map((t) => [t.id, t.channelId]));
  const channelIds = [...new Set([...idsOf(['channel', 'chat']), ...threadChannel.values()])];
  const channels = channelIds.length
    ? await db
        .select(channelRefColumns)
        .from(schema.channels)
        .where(
          and(
            inArray(schema.channels.id, channelIds),
            eq(schema.channels.communityId, communityId),
          ),
        )
    : [];
  const byId = new Map(channels.map((c) => [c.id, c]));
  const ow = await overwritesFor(overwriteLayers(channels));

  // One context per person, however many of their sockets are here.
  const contexts = new Map<string, Promise<MemberContext>>();
  return Promise.all(
    sockets.map(async ({ userId, rooms }) => {
      let pending = contexts.get(userId ?? '');
      if (!pending) {
        pending = memberContextFor(community, userId);
        contexts.set(userId ?? '', pending);
      }
      const ctx = await pending;
      if (!canView(community, ctx.isMember) || ctx.banned) return rooms;
      const sees = (channelId: string | undefined) => {
        const channel = channelId ? byId.get(channelId) : undefined;
        return Boolean(channel && has(permissionsWith(ctx, channel, ow), Permission.VIEW_CHANNEL));
      };
      return rooms.filter((room) => {
        const [kind, id] = room.split(':') as [string, string];
        if (kind === 'community') return id !== communityId;
        if (kind === 'channel' || kind === 'chat') return !sees(id);
        if (kind === 'thread') return !sees(threadChannel.get(id));
        return true;
      });
    }),
  );
}

/**
 * Whether a member with no roles but @everyone can see this channel. Used to keep what goes to
 * webhooks (other sites, Discord) to channels that aren't restricted.
 */
export async function everyoneCanView(channel: ChannelRef): Promise<boolean> {
  const everyone = await db
    .select({ id: schema.roles.id, permissions: schema.roles.permissions })
    .from(schema.roles)
    .where(and(eq(schema.roles.communityId, channel.communityId), eq(schema.roles.isDefault, true)))
    .limit(1);
  if (!everyone[0]) return false;
  const ids = channel.parentId ? [channel.parentId, channel.id] : [channel.id];
  const ow = await overwritesFor(ids);
  const perms = computeChannelPermissions({
    base: computeBasePermissions({ isOwner: false, everyone: everyone[0].permissions, roles: [] }),
    everyoneRoleId: everyone[0].id,
    memberRoleIds: [],
    userId: '',
    layers: ids.map((id) => ow.get(id) ?? []),
    timedOut: false,
  });
  return has(perms, Permission.VIEW_CHANNEL);
}
