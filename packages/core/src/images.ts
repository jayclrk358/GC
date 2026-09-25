import sharp, { type Metadata } from 'sharp';
import { randomToken } from '@magnox/shared';
import { badRequest } from './errors';

export const UPLOAD_PURPOSES = {
  avatar: { maxBytes: 5_000_000, width: 512, height: 512, fit: 'cover' as const },
  icon: { maxBytes: 5_000_000, width: 512, height: 512, fit: 'cover' as const },
  banner: { maxBytes: 10_000_000, width: 2400, height: 1000, fit: 'inside' as const },
  background: { maxBytes: 10_000_000, width: 2560, height: 1600, fit: 'inside' as const },
  gallery: { maxBytes: 10_000_000, width: 2560, height: 2560, fit: 'inside' as const },
  content: { maxBytes: 10_000_000, width: 2560, height: 2560, fit: 'inside' as const },
  emoji: { maxBytes: 1_000_000, width: 128, height: 128, fit: 'contain' as const },
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
}

function newKey(ext: 'webp'): string {
  return `u/${randomToken(24)}.${ext}`;
}

/**
 * Validate and re-encode an uploaded image. Re-encoding strips EXIF/GPS metadata and
 * neutralises polyglot files. SVG and anything sharp can't decode are rejected.
 */
export async function processImage(input: Buffer, purpose: UploadPurpose): Promise<ProcessedImage> {
  const spec = UPLOAD_PURPOSES[purpose];
  if (input.byteLength > spec.maxBytes) {
    throw badRequest(`That file is too large (max ${Math.round(spec.maxBytes / 1_000_000)} MB).`);
  }
  let meta: Metadata;
  try {
    meta = await sharp(input, { animated: true, limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw badRequest('That file is not a supported image.');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw badRequest('Please upload a PNG, JPEG, WebP, AVIF or GIF image.');
  }
  const animated = (meta.pages ?? 1) > 1;
  const pipeline = sharp(input, { animated, limitInputPixels: 50_000_000 })
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
    const poster = await sharp(input, { pages: 1 })
      .rotate()
      .resize({ width: spec.width, height: spec.height, fit: spec.fit, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    result.poster = { key: newKey('webp'), body: poster };
  }
  return result;
}
