import { and, asc, eq, isNull, max, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  ALL_PERMISSIONS,
  CHANNEL_SCOPED,
  channelInputSchema,
  has,
  newId,
  parsePermissions,
  Permission,
  MAX_PLAN_LIMITS,
} from '@magnox/shared';
import { z } from 'zod';
import {
  channelPermissionsMany,
  requirePerm,
  type ChannelRef,
  type MemberContext,
} from '../access';
import { AppError, conflict, forbidden, notFound } from '../errors';
import { audit } from './audit';
import { assertUnderPlanLimit } from './billing';
import { messageRefs, postRefs, queueMediaCleanup } from './media-cleanup';

export type ChannelRow = typeof schema.channels.$inferSelect;

export interface ChannelView {
  id: string;
  parentId: string | null;
  type: ChannelRow['type'];
  name: string;
  topic: string;
  position: number;
  settings: ChannelRow['settings'];
  slowmodeSeconds: number;
  lastActivityAt: Date | null;
  /** Viewer's permissions in this channel, as a decimal string. */
  perms: string;
}

export interface ChannelTree {
  categories: { id: string | null; name: string; channels: ChannelView[] }[];
}

async function bumpPermVersion(communityId: string) {
  await db
    .update(schema.communities)
    .set({ permVersion: sql`${schema.communities.permVersion} + 1` })
    .where(eq(schema.communities.id, communityId));
}

export async function listChannelRows(communityId: string): Promise<ChannelRow[]> {
  return db
    .select()
    .from(schema.channels)
    .where(and(eq(schema.channels.communityId, communityId), isNull(schema.channels.archivedAt)))
    .orderBy(asc(schema.channels.position), asc(schema.channels.createdAt));
}

/** Channels the viewer can see, with their effective permissions, grouped by category. */
export async function listVisibleChannels(
  ctx: MemberContext,
  opts: { types?: ChannelRow['type'][] } = {},
): Promise<{ channels: ChannelView[]; tree: ChannelTree }> {
  const rows = await listChannelRows(ctx.community.id);
  const perms = await channelPermissionsMany(ctx, rows as ChannelRef[]);
  const visible = rows.filter(
    (r) => r.type === 'category' || has(perms.get(r.id) ?? 0n, Permission.VIEW_CHANNEL),
  );
  const views: ChannelView[] = visible.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    type: r.type,
    name: r.name,
    topic: r.topic,
    position: r.position,
    settings: r.settings,
    slowmodeSeconds: r.slowmodeSeconds,
    lastActivityAt: r.lastActivityAt,
    perms: String(perms.get(r.id) ?? 0n),
  }));
  const wanted = (v: ChannelView) =>
    v.type !== 'category' && (!opts.types || opts.types.includes(v.type));
  const categories: ChannelTree['categories'] = [];
  const uncategorised = views.filter((v) => wanted(v) && !v.parentId);
  if (uncategorised.length) categories.push({ id: null, name: '', channels: uncategorised });
  for (const cat of views.filter((v) => v.type === 'category')) {
    const children = views.filter((v) => wanted(v) && v.parentId === cat.id);
    if (children.length) categories.push({ id: cat.id, name: cat.name, channels: children });
  }
  return { channels: views.filter(wanted), tree: { categories } };
}

export async function getChannelByName(ctx: MemberContext, name: string): Promise<ChannelView> {
  const { channels } = await listVisibleChannels(ctx);
  const channel = channels.find((c) => c.name === name.toLowerCase());
  if (!channel) throw notFound('Channel');
  return channel;
}

export async function getChannelById(ctx: MemberContext, id: string): Promise<ChannelView> {
  const { channels } = await listVisibleChannels(ctx);
  const channel = channels.find((c) => c.id === id);
  if (!channel) throw notFound('Channel');
  return channel;
}

async function assertCategory(communityId: string, parentId: string | null) {
  if (!parentId) return;
  const parent = await db.query.channels.findFirst({
    where: and(eq(schema.channels.id, parentId), eq(schema.channels.communityId, communityId)),
  });
  if (!parent || parent.type !== 'category')
    throw new AppError('validation', 'Choose a valid category.');
}

async function nameTaken(communityId: string, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(
      and(
        eq(schema.channels.communityId, communityId),
        eq(schema.channels.name, name),
        sql`${schema.channels.type} <> 'category'`,
      ),
    );
  return rows.some((r) => r.id !== exceptId);
}

export async function createChannel(ctx: MemberContext, raw: unknown): Promise<ChannelRow> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const input = channelInputSchema.parse(raw);
  const existing = await listChannelRows(ctx.community.id);
  await assertUnderPlanLimit(ctx.community.id, 'channels', existing.length, 'channels');
  if (input.type !== 'category') {
    await assertCategory(ctx.community.id, input.parentId);
    if (await nameTaken(ctx.community.id, input.name)) {
      throw new AppError('conflict', 'A channel with that name already exists.', {
        fields: { name: 'Already taken' },
      });
    }
  }
  const [{ top } = { top: null }] = await db
    .select({ top: max(schema.channels.position) })
    .from(schema.channels)
    .where(eq(schema.channels.communityId, ctx.community.id));
  const id = newId();
  const [row] = await db
    .insert(schema.channels)
    .values({
      id,
      communityId: ctx.community.id,
      type: input.type,
      name: input.name,
      parentId: input.type === 'category' ? null : input.parentId,
      topic: input.type === 'category' ? '' : input.topic,
      settings: input.type === 'category' ? {} : input.settings,
      slowmodeSeconds: input.type === 'category' ? 0 : input.slowmodeSeconds,
      position: (top ?? 0) + 1,
    })
    .returning();
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'channel.create',
    targetType: 'channel',
    targetId: id,
    diff: { name: input.name, type: input.type },
  });
  return row!;
}

async function loadChannelRow(ctx: MemberContext, id: string): Promise<ChannelRow> {
  const row = await db.query.channels.findFirst({
    where: and(eq(schema.channels.id, id), eq(schema.channels.communityId, ctx.community.id)),
  });
  if (!row) throw notFound('Channel');
  return row;
}

export async function updateChannel(ctx: MemberContext, id: string, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const row = await loadChannelRow(ctx, id);
  const input = channelInputSchema.parse({ ...(raw as object), type: row.type });
  if (input.type !== 'category') {
    await assertCategory(ctx.community.id, input.parentId);
    if (input.name !== row.name && (await nameTaken(ctx.community.id, input.name, id))) {
      throw conflict('A channel with that name already exists.');
    }
  }
  await db
    .update(schema.channels)
    .set(
      input.type === 'category'
        ? { name: input.name }
        : {
            name: input.name,
            topic: input.topic,
            parentId: input.parentId,
            settings: input.settings,
            slowmodeSeconds: input.slowmodeSeconds,
          },
    )
    .where(eq(schema.channels.id, id));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'channel.update',
    targetType: 'channel',
    targetId: id,
    diff: { name: input.name },
  });
}

export async function deleteChannel(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const row = await loadChannelRow(ctx, id);
  // Messages and threads go with the channel, so note the files they used first.
  const media =
    row.type === 'category'
      ? []
      : [
          ...(await messageRefs(sql`m.channel_id = ${id}`)),
          ...(await postRefs(
            sql`p.thread_id in (select id from threads where channel_id = ${id})`,
          )),
        ];
  await db.transaction(async (tx) => {
    if (row.type === 'category') {
      await tx
        .update(schema.channels)
        .set({ parentId: null })
        .where(eq(schema.channels.parentId, id));
    }
    await tx.delete(schema.channels).where(eq(schema.channels.id, id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'channel.delete',
      targetType: 'channel',
      targetId: id,
      diff: { name: row.name },
    });
  });
  await bumpPermVersion(ctx.community.id);
  if (media.length) await queueMediaCleanup({ kind: 'refs', refs: media });
}

/** Save a new order for all channels (and categories). Parents are not changed here. */
export async function reorderChannels(ctx: MemberContext, rawIds: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const ids = z.array(z.string().uuid()).max(MAX_PLAN_LIMITS.channels).parse(rawIds);
  const rows = await listChannelRows(ctx.community.id);
  const set = new Set(rows.map((r) => r.id));
  if (ids.length !== set.size || !ids.every((i) => set.has(i))) {
    throw new AppError('bad_request', 'The channel list is out of date. Refresh and try again.');
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(schema.channels)
        .set({ position: i + 1 })
        .where(eq(schema.channels.id, ids[i]!));
    }
  });
}

export interface OverwriteView {
  targetType: 'role' | 'member';
  targetId: string;
  allow: string;
  deny: string;
}

export async function listOverwrites(
  ctx: MemberContext,
  channelId: string,
): Promise<OverwriteView[]> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  await loadChannelRow(ctx, channelId);
  const rows = await db
    .select()
    .from(schema.permissionOverwrites)
    .where(eq(schema.permissionOverwrites.channelId, channelId));
  return rows.map((r) => ({
    targetType: r.targetType,
    targetId: r.targetId,
    allow: String(r.allow),
    deny: String(r.deny),
  }));
}

const overwriteSchema = z.object({
  targetType: z.enum(['role', 'member']),
  targetId: z.string().min(1).max(64),
  allow: z.string().regex(/^\d{1,20}$/),
  deny: z.string().regex(/^\d{1,20}$/),
});

/** Set (or clear, when both are zero) one role/member overwrite on a channel. */
export async function setOverwrite(
  ctx: MemberContext,
  channelId: string,
  raw: unknown,
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  requirePerm(
    ctx,
    Permission.MANAGE_ROLES,
    'Changing channel permissions also needs Manage roles.',
  );
  await loadChannelRow(ctx, channelId);
  const input = overwriteSchema.parse(raw);
  const allow = parsePermissions(input.allow) & CHANNEL_SCOPED;
  const deny = parsePermissions(input.deny) & CHANNEL_SCOPED & ~allow;
  if (!ctx.isOwner && ctx.base !== ALL_PERMISSIONS && ((allow | deny) & ~ctx.base) !== 0n) {
    throw forbidden("You can't change permissions you don't have yourself.");
  }
  if (input.targetType === 'role') {
    const role = await db.query.roles.findFirst({
      where: and(
        eq(schema.roles.id, input.targetId),
        eq(schema.roles.communityId, ctx.community.id),
      ),
    });
    if (!role) throw notFound('Role');
    if (!ctx.isOwner && !role.isDefault && role.position >= ctx.topPosition) {
      throw forbidden('You can only change permissions for roles below your own.');
    }
  } else {
    const member = await db.query.members.findFirst({
      where: and(
        eq(schema.members.communityId, ctx.community.id),
        eq(schema.members.userId, input.targetId),
      ),
    });
    if (!member) throw notFound('Member');
  }
  await db.transaction(async (tx) => {
    const key = and(
      eq(schema.permissionOverwrites.channelId, channelId),
      eq(schema.permissionOverwrites.targetType, input.targetType),
      eq(schema.permissionOverwrites.targetId, input.targetId),
    );
    if (allow === 0n && deny === 0n) {
      await tx.delete(schema.permissionOverwrites).where(key);
    } else {
      await tx
        .insert(schema.permissionOverwrites)
        .values({ channelId, targetType: input.targetType, targetId: input.targetId, allow, deny })
        .onConflictDoUpdate({
          target: [
            schema.permissionOverwrites.channelId,
            schema.permissionOverwrites.targetType,
            schema.permissionOverwrites.targetId,
          ],
          set: { allow, deny },
        });
    }
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'channel.permissions',
      targetType: 'channel',
      targetId: channelId,
      diff: {
        target: `${input.targetType}:${input.targetId}`,
        allow: String(allow),
        deny: String(deny),
      },
    });
  });
  await bumpPermVersion(ctx.community.id);
}

export function channelPerms(view: ChannelView): bigint {
  return BigInt(view.perms);
}
