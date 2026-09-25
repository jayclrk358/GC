import { eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { newId, Permission } from '@magnox/shared';
import { getMemberContext, requirePerm } from '../access';
import { processImage, UPLOAD_PURPOSES, type UploadPurpose } from '../images';
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

const COMMUNITY_PURPOSES = new Set<UploadPurpose>(['icon', 'banner', 'background', 'gallery', 'emoji']);

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
  await enforceRateLimit(`upload:${opts.userId}`, 40, 600, 'Too many uploads. Please wait a few minutes.');
  if (COMMUNITY_PURPOSES.has(opts.purpose)) {
    if (!opts.communityId) throw new AppError('bad_request', 'Missing community.');
    const ctx = await getMemberContext({ id: opts.communityId }, opts.userId);
    requirePerm(ctx, opts.purpose === 'emoji' ? Permission.MANAGE_EMOJI : Permission.MANAGE_COMMUNITY);
  }
  const img = await processImage(opts.data, opts.purpose);
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
  const map = new Map<string, string>();
  for (const key of keys) {
    const row = await db.query.uploads.findFirst({ where: eq(schema.uploads.key, key) });
    if (row?.posterKey) map.set(key, row.posterKey);
  }
  return map;
}
