import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { db, schema } from '@gamecentral/db';
import {
  BLOCK_TYPES,
  blockConfigSchemas,
  defaultBlockConfig,
  newId,
  Permission,
  sanitizeDoc,
  type Block,
  type BlockType,
} from '@gamecentral/shared';
import { z } from 'zod';
import { requirePerm, type MemberContext } from '../access';
import { AppError, notFound } from '../errors';
import { audit } from './audit';

const MAX_BLOCKS = 40;

function isBlockType(t: string): t is BlockType {
  return (BLOCK_TYPES as string[]).includes(t);
}

export async function listBlocks(
  communityId: string,
  opts: { includeHidden?: boolean } = {},
): Promise<Block[]> {
  const rows = await db
    .select()
    .from(schema.pageBlocks)
    .where(
      opts.includeHidden
        ? eq(schema.pageBlocks.communityId, communityId)
        : and(eq(schema.pageBlocks.communityId, communityId), eq(schema.pageBlocks.visible, true)),
    )
    .orderBy(asc(schema.pageBlocks.position));
  const out: Block[] = [];
  for (const r of rows) {
    if (!isBlockType(r.type)) continue;
    const parsed = blockConfigSchemas[r.type].safeParse(r.config);
    if (!parsed.success) continue;
    out.push({ id: r.id, type: r.type, visible: r.visible, config: parsed.data } as Block);
  }
  return out;
}

/** Validate a block config and every id it references. */
async function validateConfig(
  ctx: MemberContext,
  type: BlockType,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const config = blockConfigSchemas[type].parse(raw) as Record<string, unknown>;
  if ((type === 'about' || type === 'richText') && config.doc) {
    config.doc = sanitizeDoc(config.doc);
  }
  if (type === 'staff') {
    const ids = config.roleIds as string[];
    if (ids.length) {
      const rows = await db
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(and(eq(schema.roles.communityId, ctx.community.id), inArray(schema.roles.id, ids)));
      if (rows.length !== ids.length)
        throw new AppError('validation', 'Unknown role in staff block.');
    }
  }
  if (type === 'serverStatus') {
    const ids = config.serverIds as string[];
    if (ids.length) {
      const rows = await db
        .select({ id: schema.gameServers.id })
        .from(schema.gameServers)
        .where(
          and(
            eq(schema.gameServers.communityId, ctx.community.id),
            inArray(schema.gameServers.id, ids),
            isNull(schema.gameServers.deletedAt),
          ),
        );
      if (rows.length !== ids.length)
        throw new AppError('validation', 'Unknown server in status block.');
    }
  }
  if (type === 'gallery') {
    const keys = (config.images as { key: string }[]).map((i) => i.key);
    if (keys.length) {
      const rows = await db
        .select({ key: schema.uploads.key })
        .from(schema.uploads)
        .where(inArray(schema.uploads.key, keys));
      if (rows.length !== new Set(keys).size)
        throw new AppError('validation', 'One of the images could not be found.');
    }
  }
  return config;
}

export async function addBlock(
  ctx: MemberContext,
  rawType: unknown,
  rawConfig?: unknown,
): Promise<Block> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const type = z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]).parse(rawType);
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.pageBlocks)
    .where(eq(schema.pageBlocks.communityId, ctx.community.id));
  if (n >= MAX_BLOCKS)
    throw new AppError('forbidden', `A page can have up to ${MAX_BLOCKS} blocks.`);
  const config = await validateConfig(ctx, type, rawConfig ?? defaultBlockConfig(type));
  const last = await db
    .select({ position: schema.pageBlocks.position })
    .from(schema.pageBlocks)
    .where(eq(schema.pageBlocks.communityId, ctx.community.id))
    .orderBy(asc(schema.pageBlocks.position));
  const position = generateKeyBetween(last.at(-1)?.position ?? null, null);
  const id = newId();
  await db
    .insert(schema.pageBlocks)
    .values({ id, communityId: ctx.community.id, type, position, config, visible: true });
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'page.block.add',
    targetType: 'block',
    targetId: id,
    diff: { type },
  });
  return { id, type, visible: true, config } as Block;
}

async function loadBlock(ctx: MemberContext, id: string) {
  const row = await db.query.pageBlocks.findFirst({
    where: and(eq(schema.pageBlocks.id, id), eq(schema.pageBlocks.communityId, ctx.community.id)),
  });
  if (!row || !isBlockType(row.type)) throw notFound('Block');
  return row as typeof row & { type: BlockType };
}

export async function updateBlock(
  ctx: MemberContext,
  id: string,
  patch: { config?: unknown; visible?: boolean },
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const row = await loadBlock(ctx, id);
  const set: Partial<typeof schema.pageBlocks.$inferInsert> = {};
  if (patch.config !== undefined) set.config = await validateConfig(ctx, row.type, patch.config);
  if (patch.visible !== undefined) set.visible = Boolean(patch.visible);
  if (!Object.keys(set).length) return;
  await db.update(schema.pageBlocks).set(set).where(eq(schema.pageBlocks.id, id));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'page.block.update',
    targetType: 'block',
    targetId: id,
  });
}

export async function reorderBlocks(ctx: MemberContext, rawIds: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const ids = z.array(z.string().uuid()).max(MAX_BLOCKS).parse(rawIds);
  const existing = await db
    .select({ id: schema.pageBlocks.id })
    .from(schema.pageBlocks)
    .where(eq(schema.pageBlocks.communityId, ctx.community.id));
  const set = new Set(existing.map((r) => r.id));
  if (ids.length !== set.size || !ids.every((i) => set.has(i))) {
    throw new AppError('bad_request', 'The block list is out of date. Refresh and try again.');
  }
  const keys = generateNKeysBetween(null, null, ids.length);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(schema.pageBlocks)
        .set({ position: keys[i]! })
        .where(eq(schema.pageBlocks.id, ids[i]!));
    }
  });
  await audit(db, { communityId: ctx.community.id, actorId: ctx.userId, action: 'page.reorder' });
}

export async function deleteBlock(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const row = await loadBlock(ctx, id);
  await db.delete(schema.pageBlocks).where(eq(schema.pageBlocks.id, row.id));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'page.block.delete',
    targetType: 'block',
    targetId: id,
    diff: { type: row.type },
  });
}
