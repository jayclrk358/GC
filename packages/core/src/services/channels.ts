import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import {
  canEditOverwrite,
  CHANNEL_SCOPED,
  channelInputSchema,
  has,
  isSelfAssignableSafe,
  newId,
  outranks,
  parsePermissions,
  Permission,
  MAX_PLAN_LIMITS,
} from '@gamecentral/shared';
import { z } from 'zod';
import {
  channelPermissions,
  channelPermissionsMany,
  requirePerm,
  type ChannelRef,
  type MemberContext,
} from '../access';
import { accessChanged } from '../emitter';
import { AppError, conflict, forbidden, notFound } from '../errors';
import { audit } from './audit';
import { assertPlanPerk, assertUnderPlanLimit } from './billing';
import { messageRefs, postRefs, queueMediaCleanup } from './media-cleanup';
import { memberRank } from './roles';
import { dropVoiceWithoutAccess, endVoiceCall } from './voice-rooms';

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
  // Categories and separators only arrange other channels, so they're never hidden themselves.
  const visible = rows.filter(
    (r) =>
      r.type === 'category' ||
      r.type === 'separator' ||
      has(perms.get(r.id) ?? 0n, Permission.VIEW_CHANNEL),
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

const isUuid = (v: string) => z.string().uuid().safeParse(v).success;

/** One channel the viewer can see (loads just it, not the whole list). */
export async function getChannelById(ctx: MemberContext, id: string): Promise<ChannelView> {
  if (!isUuid(id)) throw notFound('Channel');
  const [r] = await db
    .select()
    .from(schema.channels)
    .where(
      and(
        eq(schema.channels.id, id),
        eq(schema.channels.communityId, ctx.community.id),
        isNull(schema.channels.archivedAt),
      ),
    )
    .limit(1);
  if (!r || r.type === 'category' || r.type === 'separator') throw notFound('Channel');
  const perms = await channelPermissions(ctx, r as ChannelRef);
  if (!has(perms, Permission.VIEW_CHANNEL)) throw notFound('Channel');
  return {
    id: r.id,
    parentId: r.parentId,
    type: r.type,
    name: r.name,
    topic: r.topic,
    position: r.position,
    settings: r.settings,
    slowmodeSeconds: r.slowmodeSeconds,
    lastActivityAt: r.lastActivityAt,
    perms: String(perms),
  };
}

async function assertCategory(communityId: string, parentId: string | null) {
  if (!parentId) return;
  const parent = await db.query.channels.findFirst({
    where: and(eq(schema.channels.id, parentId), eq(schema.channels.communityId, communityId)),
  });
  if (!parent || parent.type !== 'category')
    throw new AppError('validation', 'Choose a valid category.');
}

/** Whether the actor can see a channel, or a category (by its own overwrites). */
async function canSee(ctx: MemberContext, channel: ChannelRef): Promise<boolean> {
  return has(await channelPermissions(ctx, channel), Permission.VIEW_CHANNEL);
}

/**
 * Moving a channel into, out of or between categories changes who can see and do what in it (a
 * category's overwrites apply to its channels), so like editing overwrites it needs Manage roles,
 * and the mover must be able to see both the channel and where it's going. Otherwise Manage
 * channels alone could take a channel out of a staff-only category and make it public.
 */
async function assertCanMove(
  ctx: MemberContext,
  channel: ChannelRef,
  parentId: string | null,
): Promise<void> {
  requirePerm(
    ctx,
    Permission.MANAGE_ROLES,
    'Moving a channel to another category changes its permissions, so it also needs Manage roles.',
  );
  const into: ChannelRef | null = parentId
    ? { id: parentId, communityId: ctx.community.id, parentId: null, type: 'category' }
    : null;
  if (!(await canSee(ctx, channel)) || (into && !(await canSee(ctx, into)))) {
    throw forbidden('You can only move channels you can see, into categories you can see.');
  }
}

/** Channels' permissions changed: people may have lost rooms they're in, or calls. */
async function channelAccessChanged(ctx: MemberContext, channel: ChannelRef): Promise<void> {
  accessChanged(ctx.community.id);
  if (channel.type === 'voice') {
    await dropVoiceWithoutAccess(ctx.community.id, { channelIds: [channel.id] });
  } else if (channel.type === 'category') {
    await dropVoiceWithoutAccess(ctx.community.id);
  }
}

async function nameTaken(communityId: string, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(
      and(
        eq(schema.channels.communityId, communityId),
        eq(schema.channels.name, name),
        sql`${schema.channels.type} not in ('category', 'separator')`,
      ),
    );
  return rows.some((r) => r.id !== exceptId);
}

export async function createChannel(ctx: MemberContext, raw: unknown): Promise<ChannelRow> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const input = channelInputSchema.parse(raw);
  const existing = await listChannelRows(ctx.community.id);
  await assertUnderPlanLimit(ctx.community.id, 'channels', existing.length, 'channels');
  if (input.type === 'separator') {
    await assertPlanPerk(ctx.community.id, 'separators', 'Custom separators');
  }
  if (input.type === 'voice') {
    const voice = existing.filter((c) => c.type === 'voice').length;
    await assertUnderPlanLimit(ctx.community.id, 'voiceChannels', voice, 'voice channels');
  }
  if (input.type !== 'category' && input.type !== 'separator') {
    await assertUploadsExist([input.settings.backgroundKey]);
  }
  if (input.type === 'separator') {
    await assertCategory(ctx.community.id, input.parentId);
  } else if (input.type !== 'category') {
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
      topic: 'topic' in input ? input.topic : '',
      settings: 'settings' in input ? input.settings : {},
      slowmodeSeconds: 'slowmodeSeconds' in input ? input.slowmodeSeconds : 0,
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
  // Categories have no parent, and separators only arrange the list (they're never hidden), so
  // only other channels change permissions by moving.
  const moved =
    input.type !== 'category' && input.type !== 'separator' && input.parentId !== row.parentId;
  if (input.type === 'separator') {
    await assertCategory(ctx.community.id, input.parentId);
  } else if (input.type !== 'category') {
    await assertCategory(ctx.community.id, input.parentId);
    if (moved) await assertCanMove(ctx, row, input.parentId);
    if (input.name !== row.name && (await nameTaken(ctx.community.id, input.name, id))) {
      throw conflict('A channel with that name already exists.');
    }
    await assertUploadsExist([input.settings.backgroundKey]);
  }
  await db
    .update(schema.channels)
    .set(
      input.type === 'category'
        ? { name: input.name }
        : input.type === 'separator'
          ? { name: input.name, parentId: input.parentId }
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
    diff: {
      name: input.name,
      ...(moved && 'parentId' in input
        ? { parentId: { from: row.parentId, to: input.parentId } }
        : {}),
    },
  });
  if (moved) {
    await bumpPermVersion(ctx.community.id);
    await channelAccessChanged(ctx, row);
  }
}

export async function deleteChannel(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const row = await loadChannelRow(ctx, id);
  if (row.type === 'category') await assertCanEmptyCategory(ctx, row.id);
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
  if (row.type === 'category') await channelAccessChanged(ctx, row);
  if (row.type === 'voice') await endVoiceCall(id);
  if (media.length) await queueMediaCleanup({ kind: 'refs', refs: media });
}

/**
 * Deleting a category leaves its channels uncategorised, without the category's overwrites: the
 * same as moving them all out of it, so the same rules apply (Manage roles, and seeing them all).
 */
async function assertCanEmptyCategory(ctx: MemberContext, categoryId: string): Promise<void> {
  const children: ChannelRef[] = (
    await db
      .select({
        id: schema.channels.id,
        communityId: schema.channels.communityId,
        parentId: schema.channels.parentId,
        type: schema.channels.type,
      })
      .from(schema.channels)
      .where(eq(schema.channels.parentId, categoryId))
  ).filter((c) => c.type !== 'separator');
  if (!children.length) return;
  requirePerm(
    ctx,
    Permission.MANAGE_ROLES,
    "Its channels would lose the category's permissions, so deleting it also needs Manage roles.",
  );
  const perms = await channelPermissionsMany(ctx, children);
  if (children.some((c) => !has(perms.get(c.id) ?? 0n, Permission.VIEW_CHANNEL))) {
    throw forbidden("This category has channels you can't see, so you can't delete it.");
  }
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
  const channel = await loadChannelRow(ctx, channelId);
  if (!(await canSee(ctx, channel))) throw notFound('Channel');
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
  const channel = await loadChannelRow(ctx, channelId);
  const input = overwriteSchema.parse(raw);
  const allow = parsePermissions(input.allow) & CHANNEL_SCOPED;
  const deny = parsePermissions(input.deny) & CHANNEL_SCOPED & ~allow;
  // What the actor holds in this channel, its category's and its own overwrites applied (not
  // community-wide): someone denied a channel can't let themselves back in.
  const mine = await channelPermissions(ctx, channel);
  if (!has(mine, Permission.VIEW_CHANNEL)) throw notFound('Channel');
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
    // Any member can take a self-assignable role, so it mustn't let them moderate anywhere.
    if (role.selfAssignable && !isSelfAssignableSafe(allow)) {
      throw new AppError(
        'validation',
        'Members can give themselves this role, so it can only be allowed everyday permissions.',
      );
    }
  } else {
    const member = await db.query.members.findFirst({
      where: and(
        eq(schema.members.communityId, ctx.community.id),
        eq(schema.members.userId, input.targetId),
      ),
    });
    if (!member) throw notFound('Member');
    if (!ctx.isOwner && !outranks(ctx, await memberRank(ctx.community, input.targetId))) {
      throw forbidden('You can only change permissions for members below you.');
    }
  }
  await db.transaction(async (tx) => {
    const key = and(
      eq(schema.permissionOverwrites.channelId, channelId),
      eq(schema.permissionOverwrites.targetType, input.targetType),
      eq(schema.permissionOverwrites.targetId, input.targetId),
    );
    const [before] = await tx
      .select({ allow: schema.permissionOverwrites.allow, deny: schema.permissionOverwrites.deny })
      .from(schema.permissionOverwrites)
      .where(key)
      .for('update');
    // Only the bits being changed count, so an overwrite that also carries bits only an admin has
    // can still be adjusted.
    if (!canEditOverwrite(mine, before ?? null, { allow, deny })) {
      throw forbidden("You can't change permissions you don't have yourself.");
    }
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
  await channelAccessChanged(ctx, channel);
}

export function channelPerms(view: ChannelView): bigint {
  return BigInt(view.perms);
}

async function assertUploadsExist(keys: (string | null | undefined)[]): Promise<void> {
  const wanted = keys.filter((k): k is string => Boolean(k));
  if (!wanted.length) return;
  const rows = await db
    .select({ key: schema.uploads.key })
    .from(schema.uploads)
    .where(inArray(schema.uploads.key, wanted));
  if (rows.length !== new Set(wanted).size)
    throw new AppError('validation', 'The background image could not be found. Upload it again.');
}

/**
 * Put the same background (or none) behind every chat channel, e.g. after choosing one for a
 * channel and ticking "use for all chat channels".
 */
export async function setChatBackgroundEverywhere(
  ctx: MemberContext,
  backgroundKey: string | null,
  backgroundDim: number,
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const input = z
    .object({
      backgroundKey: z
        .string()
        .regex(/^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/)
        .nullable(),
      backgroundDim: z.number().int().min(0).max(95),
    })
    .parse({ backgroundKey, backgroundDim });
  await assertUploadsExist([input.backgroundKey]);
  await db
    .update(schema.channels)
    .set({
      settings: sql`${schema.channels.settings} || ${JSON.stringify(input)}::jsonb`,
    })
    .where(
      and(eq(schema.channels.communityId, ctx.community.id), eq(schema.channels.type, 'text')),
    );
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'channel.update',
    targetType: 'channel',
    diff: { chatBackground: input.backgroundKey ? 'all chat channels' : 'removed everywhere' },
  });
}
