import { PLAN_LIMITS, randomToken } from '@gamecentral/shared';
import { badRequest } from './errors';
import type { ProcessedImage } from './images';

const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
  'mmp4',
]);

/** What the file really is, from its first bytes (never trusting the name or browser type). */
function sniff(buf: Buffer): 'mp4' | 'webm' | null {
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp') {
    return MP4_BRANDS.has(buf.toString('latin1', 8, 12)) ? 'mp4' : null;
  }
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) {
    // EBML header: the document type must be WebM (not other Matroska files).
    return buf.subarray(0, 64).includes('webm', 0, 'latin1') ? 'webm' : null;
  }
  return null;
}

/** Width and height of the first video track in an MP4 ("tkhd" boxes), or 0 if unknown. */
function mp4Size(buf: Buffer): { width: number; height: number } {
  let from = 0;
  for (let i = 0; i < 16; i++) {
    const at = buf.indexOf('tkhd', from, 'latin1');
    if (at < 4) break;
    const size = buf.readUInt32BE(at - 4);
    const end = at - 4 + size;
    if (size > 16 && end <= buf.length) {
      const width = buf.readUInt32BE(end - 8) >>> 16;
      const height = buf.readUInt32BE(end - 4) >>> 16;
      if (width > 0 && height > 0 && width <= 16_384 && height <= 16_384) return { width, height };
    }
    from = at + 4;
  }
  return { width: 0, height: 0 };
}

/**
 * Accept a video upload as-is (no transcoding): MP4 or WebM only, checked by content, up to
 * `maxBytes` (the community plan's limit; Free's by default). Browsers play these directly from
 * the media origin.
 */
export function processVideo(
  input: Buffer,
  maxBytes = PLAN_LIMITS.free.videoMb * 1_000_000,
): ProcessedImage {
  if (input.byteLength > maxBytes) {
    throw badRequest(`That video is too large (max ${Math.round(maxBytes / 1_000_000)} MB).`);
  }
  const kind = sniff(input);
  if (!kind) throw badRequest('Videos must be MP4 or WebM files.');
  const size = kind === 'mp4' ? mp4Size(input) : { width: 0, height: 0 };
  return {
    key: `u/${randomToken(24)}.${kind}`,
    body: input,
    mime: kind === 'mp4' ? 'video/mp4' : 'video/webm',
    ...size,
    animated: false,
  };
}
