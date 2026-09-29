import sharp, { type Metadata } from 'sharp';

// Every image is different, so libvips' cache of recent operations only holds memory (tens of
// MB per process) without ever being reused.
sharp.cache(false);
import {
  IMAGE_VARIANTS,
  PLAN_LIMITS,
  randomToken,
  VARIANTS_BY_PURPOSE,
  variantKey,
} from '@magnox/shared';
import { badRequest } from './errors';

export const UPLOAD_PURPOSES = {
  avatar: { maxBytes: 5_000_000, width: 512, height: 512, fit: 'cover' as const },
  icon: { maxBytes: 5_000_000, width: 512, height: 512, fit: 'cover' as const },
  banner: { maxBytes: 10_000_000, width: 2400, height: 1000, fit: 'inside' as const },
  background: { maxBytes: 10_000_000, width: 2560, height: 1600, fit: 'inside' as const },
  gallery: { maxBytes: 10_000_000, width: 2560, height: 2560, fit: 'inside' as const },
  content: { maxBytes: 10_000_000, width: 2560, height: 2560, fit: 'inside' as const },
  emoji: { maxBytes: 1_000_000, width: 128, height: 128, fit: 'contain' as const },
  // Shown beside every name, so always a still image (a GIF keeps its first frame).
  'role-icon': {
    maxBytes: 1_000_000,
    width: 128,
    height: 128,
    fit: 'contain' as const,
    still: true,
  },
  // Still of a video's opening frame, made by the uploader's browser; shown until it's played.
  poster: { maxBytes: 5_000_000, width: 1024, height: 1024, fit: 'inside' as const },
  // Link preview images, shown as small thumbnails beside the link.
  preview: {
    maxBytes: 5_000_000,
    width: 320,
    height: 320,
    fit: 'inside' as const,
    // Shown still, so only the first frame of an animation is encoded.
    still: true,
  },
  // Chat videos: stored as uploaded (see video.ts); the size fields don't apply.
  video: {
    maxBytes: PLAN_LIMITS.free.videoMb * 1_000_000,
    width: 0,
    height: 0,
    fit: 'inside' as const,
  },
} as const;

export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);

export interface ProcessedImage {
  key: string;
  body: Buffer;
  mime: string;
  width: number;
  height: number;
  animated: boolean;
  poster?: { key: string; body: Buffer };
  /** Smaller copies (see IMAGE_VARIANTS), stored next to the original. */
  variants?: { key: string; body: Buffer }[];
}

function newKey(ext: 'webp'): string {
  return `u/${randomToken(24)}.${ext}`;
}

/**
 * Validate and re-encode an uploaded image. Re-encoding strips EXIF/GPS metadata and
 * neutralises polyglot files. SVG and anything sharp can't decode are rejected.
 */
export async function processImage(
  input: Buffer,
  purpose: UploadPurpose,
  /** A larger size limit than the purpose's own (a community plan's). */
  maxBytes?: number,
): Promise<ProcessedImage> {
  const spec = UPLOAD_PURPOSES[purpose];
  const max = Math.max(spec.maxBytes, maxBytes ?? 0);
  // Pictures fetched for link previews end up tiny, so don't decode anything huge for them.
  const limitInputPixels = purpose === 'preview' ? 16_000_000 : 50_000_000;
  if (input.byteLength > max) {
    throw badRequest(`That file is too large (max ${Math.round(max / 1_000_000)} MB).`);
  }
  let meta: Metadata;
  try {
    meta = await sharp(input, { animated: true, limitInputPixels }).metadata();
  } catch {
    throw badRequest('That file is not a supported image.');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw badRequest('Please upload a PNG, JPEG, WebP, AVIF or GIF image.');
  }
  const animated = (meta.pages ?? 1) > 1 && !('still' in spec && spec.still);
  const pipeline = sharp(input, { animated, limitInputPixels })
    .rotate()
    .resize({ width: spec.width, height: spec.height, fit: spec.fit, withoutEnlargement: true });
  const { data, info } = await pipeline
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const result: ProcessedImage = {
    key: newKey('webp'),
    body: data,
    mime: 'image/webp',
    width: info.width,
    height: animated ? (info.pageHeight ?? info.height) : info.height,
    animated,
  };
  if (animated) {
    // The still frame stands in for the animation inline, so it needn't be full size.
    const poster = await sharp(input, { pages: 1 })
      .rotate()
      .resize({
        width: Math.min(spec.width, IMAGE_VARIANTS.md),
        height: Math.min(spec.height, IMAGE_VARIANTS.md),
        fit: spec.fit,
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    result.poster = { key: newKey('webp'), body: poster };
  }
  result.variants = await makeVariants(result.key, data, purpose, {
    width: result.width,
    height: result.height,
    animated,
  });
  return result;
}

/**
 * The smaller copies of a stored image for its purpose. An image already that small is copied
 * as-is, so each copy always exists and pages can link to it without checking.
 */
export async function makeVariants(
  key: string,
  webp: Buffer,
  purpose: string,
  size?: { width: number; height: number; animated: boolean },
): Promise<{ key: string; body: Buffer }[]> {
  const wanted = VARIANTS_BY_PURPOSE[purpose] ?? [];
  if (!wanted.length) return [];
  const info = size ?? (await sizeOf(webp));
  const out: { key: string; body: Buffer }[] = [];
  for (const variant of wanted) {
    const vkey = variantKey(key, variant);
    if (!vkey) continue;
    const max = IMAGE_VARIANTS[variant];
    const body =
      Math.max(info.width, info.height) <= max
        ? webp
        : await sharp(webp, { animated: info.animated, limitInputPixels: 50_000_000 })
            .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80, effort: 4 })
            .toBuffer();
    out.push({ key: vkey, body });
  }
  return out;
}

async function sizeOf(webp: Buffer) {
  const meta = await sharp(webp, { animated: true }).metadata();
  const animated = (meta.pages ?? 1) > 1;
  return {
    width: meta.width ?? 0,
    height: animated ? (meta.pageHeight ?? meta.height ?? 0) : (meta.height ?? 0),
    animated,
  };
}
