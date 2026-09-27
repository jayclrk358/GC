import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  ALL_PERMISSIONS,
  has,
  newId,
  parsePermissions,
  Permission,
  roleInputSchema,
} from '@magnox/shared';
import { z } from 'zod';
import { requirePerm, type MemberContext } from '../access';
import { AppError, forbidden, notFound } from '../errors';
import { mediaUrl } from '../storage';
import { audit } from './audit';

export type RoleRow = typeof schema.roles.$inferSelect;

export async function listRoles(communityId: string): Promise<RoleRow[]> {
  return db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.communityId, communityId))
    .orderBy(sql`${schema.roles.position} desc`);
}

async function bumpPermVersion(communityId: string) {
  await db
    .update(schema.communities)
    .set({ permVersion: sql`${schema.communities.permVersion} + 1` })
    .where(eq(schema.communities.id, communityId));
}

async function loadRole(ctx: MemberContext, roleId: string): Promise<RoleRow> {
  const role = await db.query.roles.findFirst({
    where: and(eq(schema.roles.id, roleId), eq(schema.roles.communityId, ctx.community.id)),
  });
  if (!role) throw notFound('Role');
  return role;
}

/** Actors can only manage roles strictly below their own highest role (owners manage all). */
function assertCanManageRole(ctx: MemberContext, role: RoleRow) {
  if (ctx.isOwner) return;
  if (!role.isDefault && role.position >= ctx.topPosition) {
    throw forbidden('You can only manage roles below your highest role.');
  }
}

/** Non-owners can't grant permissions they don't have themselves. */
function assertCanGrant(ctx: MemberContext, perms: bigint) {
  if (ctx.isOwner || ctx.base === ALL_PERMISSIONS) return;
  if ((perms & ~ctx.base) !== 0n) throw forbidden("You can't grant permissions you don't have.");
}

/** A role icon must be an image uploaded for this community as a role icon. */
async function assertRoleIcon(ctx: MemberContext, key: string | null | undefined): Promise<void> {
  if (!key) return;
  const row = await db.query.uploads.findFirst({
    where: and(eq(schema.uploads.key, key), eq(schema.uploads.communityId, ctx.community.id)),
  });
  if (!row || row.purpose !== 'role-icon')
    throw new AppError('validation', 'That image could not be found.', {
      fields: { iconKey: 'Upload the icon again' },
    });
}

export async function createRole(ctx: MemberContext, raw: unknown): Promise<RoleRow> {
  requirePerm(ctx, Permission.MANAGE_ROLES);
  const input = roleInputSchema.parse(raw);
  const permissions = parsePermissions(input.permissions);
  assertCanGrant(ctx, permissions);
  await assertRoleIcon(ctx, input.iconKey);
  const existing = await listRoles(ctx.community.id);
  if (existing.length >= 100)
    throw new AppError('forbidden', 'A community can have up to 100 roles.');

  const role = await db.transaction(async (tx) => {
    // New roles go to the bottom of the hierarchy, just above @everyone.
    await tx
      .update(schema.roles)
      .set({ position: sql`${schema.roles.position} + 1` })
      .where(and(eq(schema.roles.communityId, ctx.community.id), gte(schema.roles.position, 1)));
    const [row] = await tx
      .insert(schema.roles)
      .values({
        id: newId(),
        communityId: ctx.community.id,
        name: input.name,
        color: input.color,
        icon: input.icon,
        iconKey: input.iconKey ?? null,
        nameStyle: input.nameStyle,
        permissions,
        hoist: input.hoist,
        mentionable: input.mentionable,
        selfAssignable: input.selfAssignable,
        position: 1,
      })
      .returning();
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'role.create',
      targetType: 'role',
      targetId: row!.id,
      diff: { name: input.name },
    });
    return row!;
  });
  await bumpPermVersion(ctx.community.id);
  return role;
}

export async function updateRole(ctx: MemberContext, roleId: string, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_ROLES);
  const role = await loadRole(ctx, roleId);
  assertCanManageRole(ctx, role);
  const input = roleInputSchema.parse(raw);
  const permissions = parsePermissions(input.permissions);
  // Only check newly added bits so an admin can still rename a role with bits they lack.
  assertCanGrant(ctx, permissions & ~role.permissions);
  await assertRoleIcon(ctx, input.iconKey);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.roles)
      .set({
        name: role.isDefault ? '@everyone' : input.name,
        color: role.isDefault ? null : input.color,
        icon: input.icon,
        // @everyone never decorates names; everyone would have it.
        ...(role.isDefault
          ? {}
          : {
              nameStyle: input.nameStyle,
              ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
            }),
        permissions,
        hoist: role.isDefault ? false : input.hoist,
        mentionable: input.mentionable,
        selfAssignable: role.isDefault ? false : input.selfAssignable,
      })
      .where(eq(schema.roles.id, role.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'role.update',
      targetType: 'role',
      targetId: role.id,
      diff: {
        name: role.name !== input.name ? { from: role.name, to: input.name } : undefined,
        permissions:
          role.permissions !== permissions
            ? { from: String(role.permissions), to: String(permissions) }
            : undefined,
      },
    });
  });
  await bumpPermVersion(ctx.community.id);
}

export async function deleteRole(ctx: MemberContext, roleId: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_ROLES);
  const role = await loadRole(ctx, roleId);
  if (role.isDefault) throw forbidden("The @everyone role can't be deleted.");
  assertCanManageRole(ctx, role);
  await db.transaction(async (tx) => {
    await tx.delete(schema.roles).where(eq(schema.roles.id, role.id));
    await tx
      .delete(schema.permissionOverwrites)
      .where(
        and(
          eq(schema.permissionOverwrites.targetType, 'role'),
          eq(schema.permissionOverwrites.targetId, role.id),
        ),
      );
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'role.delete',
      targetType: 'role',
      targetId: role.id,
      diff: { name: role.name },
    });
  });
  await bumpPermVersion(ctx.community.id);
}

/**
 * Reorder the roles the actor may manage. `orderedIds` is top → bottom and must contain exactly
 * the manageable roles; they reuse the positions they already occupy, so roles above the actor
 * never move.
 */
export async function reorderRoles(ctx: MemberContext, orderedIds: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_ROLES);
  const ids = z.array(z.string().uuid()).max(100).parse(orderedIds);
  const roles = (await listRoles(ctx.community.id)).filter((r) => !r.isDefault);
  const manageable = roles.filter((r) => ctx.isOwner || r.position < ctx.topPosition);
  const manageableIds = new Set(manageable.map((r) => r.id));
  if (ids.length !== manageable.length || !ids.every((id) => manageableIds.has(id))) {
    throw new AppError('bad_request', 'The role list is out of date. Refresh and try again.');
  }
  const positions = manageable.map((r) => r.position).sort((a, b) => b - a);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(schema.roles)
        .set({ position: positions[i]! })
        .where(eq(schema.roles.id, ids[i]!));
    }
    await audit(tx, { communityId: ctx.community.id, actorId: ctx.userId, action: 'role.reorder' });
  });
  await bumpPermVersion(ctx.community.id);
}

async function targetTopPosition(communityId: string, userId: string): Promise<number> {
  const rows = await db
    .select({ position: schema.roles.position })
    .from(schema.memberRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberRoles.roleId))
    .where(
      and(eq(schema.memberRoles.communityId, communityId), eq(schema.memberRoles.userId, userId)),
    );
  return Math.max(0, ...rows.map((r) => r.position));
}

export async function setMemberRole(
  ctx: MemberContext,
  userId: string,
  roleId: string,
  assign: boolean,
): Promise<void> {
  const role = await loadRole(ctx, roleId);
  if (role.isDefault) throw new AppError('bad_request', 'Everyone has the @everyone role.');
  const self = userId === ctx.userId;
  const selfService = self && role.selfAssignable && ctx.isMember;
  if (!selfService) {
    requirePerm(ctx, Permission.MANAGE_ROLES);
    assertCanManageRole(ctx, role);
    if (!ctx.isOwner && !self) {
      const top = await targetTopPosition(ctx.community.id, userId);
      if (userId === ctx.community.ownerId || top >= ctx.topPosition) {
        throw forbidden('You can only change roles for members below you.');
      }
    }
  }
  const member = await db.query.members.findFirst({
    where: and(eq(schema.members.communityId, ctx.community.id), eq(schema.members.userId, userId)),
  });
  if (!member) throw notFound('Member');

  await db.transaction(async (tx) => {
    if (assign) {
      await tx
        .insert(schema.memberRoles)
        .values({ communityId: ctx.community.id, userId, roleId })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(schema.memberRoles)
        .where(
          and(
            eq(schema.memberRoles.communityId, ctx.community.id),
            eq(schema.memberRoles.userId, userId),
            eq(schema.memberRoles.roleId, roleId),
          ),
        );
    }
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: assign ? 'member.role.add' : 'member.role.remove',
      targetType: 'user',
      targetId: userId,
      diff: { role: role.name },
    });
  });
  await bumpPermVersion(ctx.community.id);
}

export function roleSummary(role: RoleRow) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    icon: role.icon,
    iconKey: role.iconKey,
    iconUrl: mediaUrl(role.iconKey),
    nameStyle: role.nameStyle,
    position: role.position,
    permissions: role.permissions.toString(),
    isDefault: role.isDefault,
    hoist: role.hoist,
    mentionable: role.mentionable,
    selfAssignable: role.selfAssignable,
  };
}
export type RoleSummary = ReturnType<typeof roleSummary>;

export function canManageRoles(ctx: MemberContext): boolean {
  return has(ctx.base, Permission.MANAGE_ROLES);
}

export async function roleIdsForMembers(communityId: string, userIds: string[]) {
  if (!userIds.length) return new Map<string, string[]>();
  const rows = await db
    .select({ userId: schema.memberRoles.userId, roleId: schema.memberRoles.roleId })
    .from(schema.memberRoles)
    .where(
      and(
        eq(schema.memberRoles.communityId, communityId),
        inArray(schema.memberRoles.userId, userIds),
      ),
    )
    .orderBy(asc(schema.memberRoles.roleId));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.roleId]);
  return map;
}
