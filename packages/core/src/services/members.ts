import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '@gamecentral/db';
import { requireMember, type MemberContext } from '../access';
import { AppError, forbidden } from '../errors';
import { enforceRateLimit } from '../ratelimit';
import { cached, uncache } from '../cache';
import { communityChanged } from '../emitter';
import { cacheRedis } from '../redis';
import { audit } from './audit';
import { checkJoinAllowed } from './automod';
import { removeFromVoice } from './voice-rooms';
import { emitMemberEvent } from './webhooks';

async function isBanned(tx: DbOrTx, communityId: string, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ expiresAt: schema.bans.expiresAt })
    .from(schema.bans)
    .where(and(eq(schema.bans.communityId, communityId), eq(schema.bans.userId, userId)))
    .limit(1);
  const ban = rows[0];
  return Boolean(ban && (!ban.expiresAt || ban.expiresAt > new Date()));
}

/** Insert a membership (idempotent) and keep the cached member count in sync. */
export async function addMember(tx: DbOrTx, communityId: string, userId: string): Promise<boolean> {
  if (await isBanned(tx, communityId, userId)) {
    throw new AppError('forbidden', "You can't join this community.");
  }
  const inserted = await tx
    .insert(schema.members)
    .values({ communityId, userId })
    .onConflictDoNothing()
    .returning({ userId: schema.members.userId });
  if (inserted.length) {
    await tx
      .update(schema.communities)
      .set({ memberCount: sql`${schema.communities.memberCount} + 1` })
      .where(eq(schema.communities.id, communityId));
    return true;
  }
  return false;
}

export async function removeMember(
  tx: DbOrTx,
  communityId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await tx
    .delete(schema.members)
    .where(and(eq(schema.members.communityId, communityId), eq(schema.members.userId, userId)))
    .returning({ userId: schema.members.userId });
  if (deleted.length) {
    await tx
      .update(schema.communities)
      .set({ memberCount: sql`greatest(${schema.communities.memberCount} - 1, 0)` })
      .where(eq(schema.communities.id, communityId));
    return true;
  }
  return false;
}

export async function joinCommunity(ctx: MemberContext): Promise<void> {
  if (!ctx.userId) throw new AppError('unauthorized', 'Please sign in to continue.');
  if (ctx.isMember) return;
  if (ctx.community.joinMode === 'invite' || ctx.community.visibility === 'private') {
    throw forbidden('This community is invite-only. Ask a member for an invite link.');
  }
  if (ctx.community.archived) {
    throw forbidden('This community is archived and isn’t taking new members.');
  }
  if (ctx.community.joinMode === 'apply') {
    throw forbidden('This community requires an application to join.');
  }
  await enforceRateLimit(`join:${ctx.userId}`, 30, 3600);
  await checkJoinAllowed(ctx.community, ctx.userId);
  const added = await db.transaction((tx) => addMember(tx, ctx.community.id, ctx.userId!));
  communityChanged(ctx.community.id, ctx.userId, 'members');
  if (added) memberJoined(ctx.community.id, ctx.userId);
}

/** Someone became a member: tell webhooks. */
export function memberJoined(communityId: string, userId: string): void {
  void uncache(`memberlist:${communityId}`);
  emitMemberEvent(communityId, userId, 'member.joined');
}

/** Someone stopped being a member. */
export function memberLeft(
  communityId: string,
  userId: string,
  reason: 'left' | 'kicked' | 'banned',
): void {
  void uncache(`memberlist:${communityId}`);
  emitMemberEvent(communityId, userId, 'member.left', reason);
}

export async function leaveCommunity(ctx: MemberContext): Promise<void> {
  requireMember(ctx);
  if (ctx.isOwner) {
    throw forbidden('Owners can’t leave. Transfer ownership or delete the community first.');
  }
  const removed = await db.transaction(async (tx) => {
    const gone = await removeMember(tx, ctx.community.id, ctx.userId!);
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'member.leave',
      targetType: 'user',
      targetId: ctx.userId!,
    });
    return gone;
  });
  await removeFromVoice(ctx.community.id, ctx.userId!);
  if (removed) memberLeft(ctx.community.id, ctx.userId!, 'left');
}

export interface MemberRow {
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  nickname: string | null;
  joinedAt: Date;
  timeoutUntil: Date | null;
  roleIds: string[];
  isOwner: boolean;
}

export async function listMembers(
  communityId: string,
  ownerId: string,
  opts: { q?: string; roleId?: string; limit?: number; offset?: number } = {},
): Promise<{ members: MemberRow[]; hasMore: boolean }> {
  const limit = Math.min(100, opts.limit ?? 50);
  const where = [eq(schema.members.communityId, communityId)];
  const q = opts.q?.trim();
  if (q) {
    const pat = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    where.push(
      or(
        ilike(schema.users.name, pat),
        ilike(schema.users.username, pat),
        ilike(schema.members.nickname, pat),
      )!,
    );
  }
  if (opts.roleId) {
    where.push(
      inArray(
        schema.members.userId,
        db
          .select({ userId: schema.memberRoles.userId })
          .from(schema.memberRoles)
          .where(
            and(
              eq(schema.memberRoles.communityId, communityId),
              eq(schema.memberRoles.roleId, opts.roleId),
            ),
          ),
      ),
    );
  }
  const rows = await db
    .select({
      userId: schema.members.userId,
      name: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
      nickname: schema.members.nickname,
      joinedAt: schema.members.joinedAt,
      timeoutUntil: schema.members.timeoutUntil,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(and(...where))
    .orderBy(asc(schema.members.joinedAt))
    .limit(limit + 1)
    .offset(opts.offset ?? 0);
  const page = rows.slice(0, limit);
  const ids = page.map((r) => r.userId);
  const roleRows = ids.length
    ? await db
        .select({ userId: schema.memberRoles.userId, roleId: schema.memberRoles.roleId })
        .from(schema.memberRoles)
        .where(
          and(
            eq(schema.memberRoles.communityId, communityId),
            inArray(schema.memberRoles.userId, ids),
          ),
        )
    : [];
  const byUser = new Map<string, string[]>();
  for (const r of roleRows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.roleId]);
  return {
    members: page.map((r) => ({
      ...r,
      roleIds: byUser.get(r.userId) ?? [],
      isOwner: r.userId === ownerId,
    })),
    hasMore: rows.length > limit,
  };
}

/** Members holding any of the given roles (for the staff block). */
export async function membersWithRoles(communityId: string, roleIds: string[], limit = 24) {
  if (!roleIds.length) return [];
  return db
    .selectDistinctOn([schema.users.id], {
      userId: schema.users.id,
      name: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
      nickname: schema.members.nickname,
      roleId: schema.memberRoles.roleId,
    })
    .from(schema.memberRoles)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberRoles.userId))
    .innerJoin(
      schema.members,
      and(
        eq(schema.members.userId, schema.memberRoles.userId),
        eq(schema.members.communityId, communityId),
      ),
    )
    .where(
      and(
        eq(schema.memberRoles.communityId, communityId),
        inArray(schema.memberRoles.roleId, roleIds),
      ),
    )
    .limit(limit);
}

/** How many of the given users are currently connected (presence keys in Redis). */
export async function countOnline(userIds: string[]): Promise<number> {
  if (!userIds.length) return 0;
  const keys = userIds.slice(0, 2000).map((id) => `presence:${id}`);
  const values = await cacheRedis().mget(...keys);
  return values.filter(Boolean).length;
}

/**
 * How many members are online. Shown on every page of the community, so it's worked out at most
 * every 20 seconds rather than on each view.
 */
export async function onlineInCommunity(communityId: string): Promise<number> {
  return cached(`online:${communityId}`, 20, async () => {
    const rows = await db
      .select({ userId: schema.members.userId })
      .from(schema.members)
      .where(eq(schema.members.communityId, communityId))
      .limit(2000);
    return countOnline(rows.map((r) => r.userId));
  });
}
