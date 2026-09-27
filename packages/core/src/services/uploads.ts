import { inArray } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { newId, Permission } from '@magnox/shared';
import { getMemberContext, requirePerm } from '../access';
import { processImage, UPLOAD_PURPOSES, type UploadPurpose } from '../images';
import { processVideo } from '../video';
import { AppError } from '../errors';
import { enforceRateLimit } from '../ratelimit';
import { mediaUrl, storage } from '../storage';

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

export function isUploadPurpose(p: string): p is UploadPurpose {
  return p in UPLOAD_PURPOSES;
}

export async function saveUpload(opts: {
  userId: string;
  purpose: UploadPurpose;
  communityId?: string | null;
  data: Buffer;
  alt?: string;
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
  const img =
    opts.purpose === 'video'
      ? processVideo(opts.data)
      : await processImage(opts.data, opts.purpose);
  await storage().put(img.key, img.body, img.mime);
  if (img.poster) await storage().put(img.poster.key, img.poster.body, 'image/webp');
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
