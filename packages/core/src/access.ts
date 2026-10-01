import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  ALL_PERMISSIONS,
  applyTimeout,
  computeBasePermissions,
  computeChannelPermissions,
  has,
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

/** Channel-level permissions for the viewer, including category and channel overwrites. */
export async function channelPermissions(ctx: MemberContext, channel: ChannelRef): Promise<bigint> {
  if (ctx.base === ALL_PERMISSIONS) return ALL_PERMISSIONS;
  const ids = channel.parentId ? [channel.parentId, channel.id] : [channel.id];
  const ow = await overwritesFor(ids);
  const layers = ids.map((id) => ow.get(id) ?? []);
  const perms = computeChannelPermissions({
    base: ctx.base,
    everyoneRoleId: ctx.everyoneRoleId,
    memberRoleIds: ctx.roleIds,
    userId: ctx.userId ?? '',
    layers,
    timedOut: ctx.timedOut || ctx.needsRules || ctx.community.archived,
  });
  return ctx.isMember ? perms : perms & GUEST_MASK;
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
  const ids = new Set<string>();
  for (const c of channels) {
    ids.add(c.id);
    if (c.parentId) ids.add(c.parentId);
  }
  const ow = await overwritesFor([...ids]);
  for (const c of channels) {
    const layerIds = c.parentId ? [c.parentId, c.id] : [c.id];
    const perms = computeChannelPermissions({
      base: ctx.base,
      everyoneRoleId: ctx.everyoneRoleId,
      memberRoleIds: ctx.roleIds,
      userId: ctx.userId ?? '',
      layers: layerIds.map((id) => ow.get(id) ?? []),
      timedOut: ctx.timedOut || ctx.needsRules || ctx.community.archived,
    });
    out.set(c.id, ctx.isMember ? perms : perms & GUEST_MASK);
  }
  return out;
}

export async function loadChannel(id: string): Promise<ChannelRef | null> {
  const rows = await db
    .select({
      id: schema.channels.id,
      communityId: schema.channels.communityId,
      parentId: schema.channels.parentId,
      type: schema.channels.type,
    })
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

/** Room authorization for the realtime server. */
export async function canSubscribe(
  userId: string | null,
  kind: string,
  id: string,
): Promise<boolean> {
  switch (kind) {
    case 'server': {
      const rows = await db
        .select({ id: schema.serverEndpoints.id })
        .from(schema.serverEndpoints)
        .where(eq(schema.serverEndpoints.id, id))
        .limit(1);
      return rows.length > 0;
    }
    case 'community': {
      try {
        await memberContextForRooms(id, userId);
        return true;
      } catch {
        return false;
      }
    }
    case 'channel': {
      const channel = await loadChannel(id);
      if (!channel) return false;
      try {
        const ctx = await memberContextForRooms(channel.communityId, userId);
        return has(await channelPermissions(ctx, channel), Permission.VIEW_CHANNEL);
      } catch {
        return false;
      }
    }
    case 'thread': {
      const thread = await db
        .select({
          communityId: schema.threads.communityId,
          channelId: schema.threads.channelId,
          deletedAt: schema.threads.deletedAt,
        })
        .from(schema.threads)
        .where(eq(schema.threads.id, id))
        .limit(1);
      const t = thread[0];
      if (!t || t.deletedAt) return false;
      const channel = await loadChannel(t.channelId);
      if (!channel) return false;
      try {
        const ctx = await memberContextForRooms(t.communityId, userId);
        return has(await channelPermissions(ctx, channel), Permission.VIEW_CHANNEL);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
