import { and, asc, count, eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  customReactionId,
  emojiImagePath,
  emojiInputSchema,
  emojiNameSchema,
  newId,
  Permission,
  type CustomEmoji,
} from '@magnox/shared';
import { requirePerm, type MemberContext } from '../access';
import { cacheRedis } from '../redis';
import { AppError, conflict, isUniqueViolation, notFound } from '../errors';
import { mediaUrl } from '../storage';
import { audit } from './audit';
import { assertUnderPlanLimit } from './billing';
import { queueMediaCleanup } from './media-cleanup';

// A community's custom emoji: small images people use as :name: in posts and as reactions.

const listKey = (communityId: string) => `cache:emoji:${communityId}`;

/** Every custom emoji in a community, by name. Kept in Redis for a minute (it's on every page). */
export async function listEmoji(communityId: string): Promise<CustomEmoji[]> {
  const redis = cacheRedis();
  const hit = await redis.get(listKey(communityId)).catch(() => null);
  if (hit) return JSON.parse(hit) as CustomEmoji[];
  const rows = await db
    .select({
      id: schema.customEmoji.id,
      name: schema.customEmoji.name,
      imageKey: schema.customEmoji.imageKey,
    })
    .from(schema.customEmoji)
    .where(eq(schema.customEmoji.communityId, communityId))
    .orderBy(asc(schema.customEmoji.name));
  const list = rows.map((r) => ({ id: r.id, name: r.name, url: emojiUrl(r.id, r.imageKey) }));
  await redis.set(listKey(communityId), JSON.stringify(list), 'EX', 60).catch(() => undefined);
  return list;
}

/**
 * The file itself, so browsers skip the /emoji/<id> redirect. That path stays for posts and
 * reactions, which only store the id.
 */
function emojiUrl(id: string, imageKey: string): string {
  return mediaUrl(imageKey) ?? emojiImagePath(id);
}

async function forget(communityId: string) {
  await cacheRedis()
    .del(listKey(communityId))
    .catch(() => undefined);
}

/** The image behind an emoji, for /emoji/<id>. */
export async function emojiImageUrl(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const row = await db.query.customEmoji.findFirst({
    where: eq(schema.customEmoji.id, id),
    columns: { imageKey: true },
  });
  return row ? mediaUrl(row.imageKey) : null;
}

/** Whether a reaction is one people can use in this community (a custom one must belong to it). */
export async function isCommunityEmojiReaction(
  communityId: string,
  reaction: string,
): Promise<boolean> {
  const id = customReactionId(reaction);
  if (!id) return false;
  return (await listEmoji(communityId)).some((e) => e.id === id);
}

export async function createEmoji(ctx: MemberContext, raw: unknown): Promise<CustomEmoji> {
  requirePerm(ctx, Permission.MANAGE_EMOJI);
  const input = emojiInputSchema.parse(raw);
  const upload = await db.query.uploads.findFirst({
    where: and(
      eq(schema.uploads.key, input.imageKey),
      eq(schema.uploads.communityId, ctx.community.id),
    ),
  });
  if (!upload || upload.purpose !== 'emoji') {
    throw new AppError('validation', 'That image could not be found. Upload it again.', {
      fields: { imageKey: 'Upload the image again' },
    });
  }
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.customEmoji)
    .where(eq(schema.customEmoji.communityId, ctx.community.id));
  await assertUnderPlanLimit(ctx.community.id, 'emoji', n, 'custom emoji');
  const id = newId();
  try {
    await db.insert(schema.customEmoji).values({
      id,
      communityId: ctx.community.id,
      name: input.name,
      imageKey: input.imageKey,
      creatorId: ctx.userId,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(`There's already an emoji called :${input.name}:.`);
    }
    throw e;
  }
  await forget(ctx.community.id);
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'emoji.create',
    targetType: 'emoji',
    targetId: id,
    diff: { name: input.name },
  });
  return { id, name: input.name, url: emojiUrl(id, input.imageKey) };
}

async function ownEmoji(ctx: MemberContext, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Emoji');
  const row = await db.query.customEmoji.findFirst({
    where: and(eq(schema.customEmoji.id, id), eq(schema.customEmoji.communityId, ctx.community.id)),
  });
  if (!row) throw notFound('Emoji');
  return row;
}

export async function renameEmoji(ctx: MemberContext, id: string, rawName: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_EMOJI);
  const row = await ownEmoji(ctx, id);
  const name = emojiNameSchema.parse(rawName);
  if (name === row.name) return;
  try {
    await db.update(schema.customEmoji).set({ name }).where(eq(schema.customEmoji.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(`There's already an emoji called :${name}:.`);
    }
    throw e;
  }
  await forget(ctx.community.id);
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'emoji.update',
    targetType: 'emoji',
    targetId: id,
    diff: { name: [row.name, name] },
  });
}

/** Remove an emoji. Posts that used it show its :name: instead. */
export async function deleteEmoji(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_EMOJI);
  const row = await ownEmoji(ctx, id);
  await db.delete(schema.customEmoji).where(eq(schema.customEmoji.id, id));
  await forget(ctx.community.id);
  await queueMediaCleanup({ kind: 'emoji', communityId: ctx.community.id, key: row.imageKey });
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'emoji.delete',
    targetType: 'emoji',
    targetId: id,
    diff: { name: row.name },
  });
}
