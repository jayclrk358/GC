import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import {
  isUuid,
  MAX_PLAN_LIMITS,
  newId,
  Permission,
  planLimits,
  type PlanId,
  VARIANTS_BY_PURPOSE,
} from '@gamecentral/shared';
import { getMemberContext, requireMember, requirePerm } from '../access';
import { env } from '../env';
import { makeVariants, processImage, UPLOAD_PURPOSES, type UploadPurpose } from '../images';
import { processVideo } from '../video';
import { AppError, notFound } from '../errors';
import { enforceRateLimit } from '../ratelimit';
import { cacheRedis } from '../redis';
import { cleanFilename, downloadFilename, mediaUrl, storage } from '../storage';
import { communityPlan } from './billing';

export interface UploadResult {
  key: string;
  url: string;
  width: number;
  height: number;
  animated: boolean;
  posterUrl: string | null;
}

/** A community's own images, uploaded by people who manage it. */
const COMMUNITY_PURPOSES = new Set<UploadPurpose>([
  'icon',
  'banner',
  'background',
  'gallery',
  'emoji',
  'role-icon',
  'channel-background',
]);

/** Uploads whose size limit grows with the community's plan. */
const PLAN_SIZED = new Set<UploadPurpose>([
  'content',
  'video',
  'gallery',
  'banner',
  'background',
  'channel-background',
]);

/**
 * How many bytes one person may store in a day (counting each file's still and smaller copies),
 * by the plan of the community it's for. Uploads that aren't for a community count as Free.
 */
const dailyUploadBytes = (plan: PlanId) => planLimits(plan).dailyUploadMb * 1_000_000;
const MOST_DAILY_UPLOAD_BYTES = MAX_PLAN_LIMITS.dailyUploadMb * 1_000_000;
const DAY_SECONDS = 86_400;
const uploadBytesKey = (userId: string) => `rl:upload-bytes:${userId}`;
const OVER_DAILY = "You've uploaded a lot today. Please try again tomorrow.";

/** One of UPLOAD_PURPOSES' own keys (`in` would also accept "toString" and the like). */
export function isUploadPurpose(p: string): p is UploadPurpose {
  return Object.hasOwn(UPLOAD_PURPOSES, p);
}

/**
 * Which community an upload is for, if its purpose takes one, once the uploader is known to be
 * allowed to upload there: community images need the right permission, and post and chat files
 * need membership. A community sent with a purpose that doesn't take one is ignored. Runs before
 * anything is stored, so a bad community never leaves files behind.
 */
async function uploadCommunity(
  userId: string,
  purpose: UploadPurpose,
  communityId: string | null | undefined,
): Promise<string | null> {
  // A banner is the community's when one is given, and otherwise the uploader's profile banner.
  const required = COMMUNITY_PURPOSES.has(purpose) && purpose !== 'banner';
  if (!communityId || !(COMMUNITY_PURPOSES.has(purpose) || PLAN_SIZED.has(purpose))) {
    if (required) throw new AppError('bad_request', 'Missing community.');
    return null;
  }
  if (!isUuid(communityId)) throw notFound('Community');
  const ctx = await getMemberContext({ id: communityId }, userId);
  if (COMMUNITY_PURPOSES.has(purpose)) {
    requirePerm(
      ctx,
      purpose === 'emoji'
        ? Permission.MANAGE_EMOJI
        : purpose === 'role-icon'
          ? Permission.MANAGE_ROLES
          : purpose === 'channel-background'
            ? Permission.MANAGE_CHANNELS
            : Permission.MANAGE_COMMUNITY,
    );
  } else {
    requireMember(ctx);
  }
  return communityId;
}

/**
 * The checks an upload must pass before its body is even read: how many files the person has
 * sent lately, and whether they've used up the largest daily allowance. The route calls this
 * first; saveUpload doesn't repeat it.
 */
export async function checkUploadAllowed(userId: string): Promise<void> {
  await enforceRateLimit(
    `upload:${userId}`,
    40,
    600,
    'Too many uploads. Please wait a few minutes.',
  );
  if (env().DISABLE_RATE_LIMITS) return;
  const used = Number((await cacheRedis().get(uploadBytesKey(userId))) ?? 0);
  if (used >= MOST_DAILY_UPLOAD_BYTES) throw new AppError('rate_limited', OVER_DAILY);
}

/**
 * Count `bytes` against the person's daily allowance, or refuse the upload if that would take
 * them over it. Returns a function that gives the bytes back (if storing the files fails).
 */
async function takeUploadBytes(
  userId: string,
  bytes: number,
  allowance: number,
): Promise<() => Promise<void>> {
  if (env().DISABLE_RATE_LIMITS) return async () => {};
  const key = uploadBytesKey(userId);
  const redis = cacheRedis();
  // The day starts with the first upload, like the windows of the other rate limits.
  const [[, total], , [, ttl]] = (await redis
    .multi()
    .incrby(key, bytes)
    .expire(key, DAY_SECONDS, 'NX')
    .ttl(key)
    .exec()) as [[null, number], [null, number], [null, number]];
  const giveBack = async () => {
    await redis.decrby(key, bytes);
  };
  if (total > allowance) {
    await giveBack();
    throw new AppError('rate_limited', OVER_DAILY, { retryAfter: ttl > 0 ? ttl : DAY_SECONDS });
  }
  return giveBack;
}

/** Check, process and store an upload. The route calls checkUploadAllowed before reading it. */
export async function saveUpload(opts: {
  userId: string;
  purpose: UploadPurpose;
  communityId?: string | null;
  data: Buffer;
  alt?: string;
  /** The file's name on the uploader's device, used again when it's downloaded. */
  filename?: string | null;
  /** For a video: a still of its opening frame, shown until it's played. */
  poster?: Buffer | null;
}): Promise<UploadResult> {
  if (opts.purpose === 'video') {
    // Videos are up to 50 MB each, so they get a tighter budget of their own.
    await enforceRateLimit(
      `upload-video:${opts.userId}`,
      10,
      3600,
      'Too many video uploads. Please try again later.',
    );
  }
  const communityId = await uploadCommunity(opts.userId, opts.purpose, opts.communityId);
  const plan: PlanId = communityId ? await communityPlan(communityId) : 'free';
  // The community plan's larger size limit, for uploads to a community the uploader is in.
  const limits = planLimits(plan);
  const maxBytes =
    communityId && PLAN_SIZED.has(opts.purpose)
      ? (opts.purpose === 'video' ? limits.videoMb : limits.imageMb) * 1_000_000
      : undefined;
  const img =
    opts.purpose === 'video'
      ? processVideo(opts.data, maxBytes)
      : await processImage(opts.data, opts.purpose, maxBytes);
  if (opts.purpose === 'video' && opts.poster) {
    // Re-encoded like any image; a still that isn't a valid image is just left out.
    const still = await processImage(opts.poster, 'poster').catch(() => null);
    if (still) {
      img.poster = { key: still.key, body: still.body };
      // WebM sizes aren't read from the file, but the still has the same shape.
      if (!img.width || !img.height)
        Object.assign(img, { width: still.width, height: still.height });
    }
  }
  const files = [
    { key: img.key, body: img.body, mime: img.mime },
    ...(img.poster ? [{ key: img.poster.key, body: img.poster.body, mime: 'image/webp' }] : []),
    ...(img.variants ?? []).map((v) => ({ key: v.key, body: v.body, mime: 'image/webp' })),
  ];
  const giveBack = await takeUploadBytes(
    opts.userId,
    files.reduce((n, f) => n + f.body.byteLength, 0),
    dailyUploadBytes(plan),
  );
  try {
    await Promise.all(files.map((f) => storage().put(f.key, f.body, f.mime)));
    await db.insert(schema.uploads).values({
      id: newId(),
      key: img.key,
      ownerId: opts.userId,
      communityId,
      purpose: opts.purpose,
      mime: img.mime,
      size: img.body.byteLength,
      width: img.width,
      height: img.height,
      animated: img.animated,
      posterKey: img.poster?.key ?? null,
      alt: (opts.alt ?? '').slice(0, 1000),
      filename: cleanFilename(opts.filename),
      variants: true,
    });
  } catch (err) {
    // Leave no files that nothing knows about, and don't count them against the uploader.
    await Promise.allSettled([...files.map((f) => storage().delete(f.key)), giveBack()]);
    throw err;
  }
  return {
    key: img.key,
    url: mediaUrl(img.key)!,
    width: img.width,
    height: img.height,
    animated: img.animated,
    posterUrl: mediaUrl(img.poster?.key),
  };
}

/** Static poster frames for animated uploads (used when a viewer turns animation off). */
export async function posterKeysFor(keys: string[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map();
  const rows = await db
    .select({ key: schema.uploads.key, posterKey: schema.uploads.posterKey })
    .from(schema.uploads)
    .where(inArray(schema.uploads.key, keys));
  return new Map(rows.flatMap((r) => (r.posterKey ? [[r.key, r.posterKey] as const] : [])));
}

/** What an upload is saved as when downloaded: the name it was uploaded with, where known. */
export async function uploadDownloadName(key: string): Promise<string> {
  const row = await db.query.uploads.findFirst({
    columns: { filename: true },
    where: eq(schema.uploads.key, key),
  });
  return downloadFilename(row?.filename, key);
}

/**
 * Make the smaller copies for images uploaded before they existed, a few at a time. Worker job;
 * returns how many images it handled, and is run again until that's 0.
 */
export async function backfillImageVariants(limit = 25): Promise<number> {
  const rows = await db
    .select({ id: schema.uploads.id, key: schema.uploads.key, purpose: schema.uploads.purpose })
    .from(schema.uploads)
    .where(
      and(
        eq(schema.uploads.variants, false),
        inArray(schema.uploads.purpose, Object.keys(VARIANTS_BY_PURPOSE)),
        eq(schema.uploads.mime, 'image/webp'),
      ),
    )
    .orderBy(asc(schema.uploads.id))
    .limit(limit);
  for (const row of rows) {
    const original = await storage().get(row.key);
    if (original) {
      try {
        const variants = await makeVariants(row.key, original, row.purpose);
        for (const v of variants) await storage().put(v.key, v.body, 'image/webp');
      } catch {
        // Unreadable originals are left as they are; pages fall back to them anyway.
      }
    }
    await db.update(schema.uploads).set({ variants: true }).where(eq(schema.uploads.id, row.id));
  }
  return rows.length;
}
