import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { newId, Permission, planLimits, VARIANTS_BY_PURPOSE } from '@magnox/shared';
import { getMemberContext, requirePerm } from '../access';
import { makeVariants, processImage, UPLOAD_PURPOSES, type UploadPurpose } from '../images';
import { processVideo } from '../video';
import { AppError } from '../errors';
import { enforceRateLimit } from '../ratelimit';
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

const COMMUNITY_PURPOSES = new Set<UploadPurpose>([
  'icon',
  'banner',
  'background',
  'gallery',
  'emoji',
  'role-icon',
]);

/** Uploads whose size limit grows with the community's plan. */
const PLAN_SIZED = new Set<UploadPurpose>(['content', 'video', 'gallery', 'banner', 'background']);

/** The community plan's size limit for this upload, if it's for a community the uploader is in. */
async function planUploadLimit(opts: {
  userId: string;
  purpose: UploadPurpose;
  communityId?: string | null;
}): Promise<number | undefined> {
  if (!opts.communityId || !PLAN_SIZED.has(opts.purpose)) return undefined;
  const ctx = await getMemberContext({ id: opts.communityId }, opts.userId).catch(() => null);
  if (!ctx?.isMember) return undefined;
  const limits = planLimits(await communityPlan(opts.communityId));
  return (opts.purpose === 'video' ? limits.videoMb : limits.imageMb) * 1_000_000;
}

export function isUploadPurpose(p: string): p is UploadPurpose {
  return p in UPLOAD_PURPOSES;
}

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
  await enforceRateLimit(
    `upload:${opts.userId}`,
    40,
    600,
    'Too many uploads. Please wait a few minutes.',
  );
  if (opts.purpose === 'video') {
    // Videos are up to 50 MB each, so they get a tighter budget of their own.
    await enforceRateLimit(
      `upload-video:${opts.userId}`,
      10,
      3600,
      'Too many video uploads. Please try again later.',
    );
  }
  if (COMMUNITY_PURPOSES.has(opts.purpose)) {
    if (!opts.communityId) throw new AppError('bad_request', 'Missing community.');
    const ctx = await getMemberContext({ id: opts.communityId }, opts.userId);
    requirePerm(
      ctx,
      opts.purpose === 'emoji'
        ? Permission.MANAGE_EMOJI
        : opts.purpose === 'role-icon'
          ? Permission.MANAGE_ROLES
          : Permission.MANAGE_COMMUNITY,
    );
  }
  const maxBytes = await planUploadLimit(opts);
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
  await Promise.all([
    storage().put(img.key, img.body, img.mime),
    img.poster && storage().put(img.poster.key, img.poster.body, 'image/webp'),
    ...(img.variants ?? []).map((v) => storage().put(v.key, v.body, 'image/webp')),
  ]);
  await db.insert(schema.uploads).values({
    id: newId(),
    key: img.key,
    ownerId: opts.userId,
    communityId: opts.communityId ?? null,
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
