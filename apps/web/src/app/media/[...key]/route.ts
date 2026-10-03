import { env, storage } from '@gamecentral/core';
import { STORED_KEY_RE } from '@gamecentral/shared';

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Serves uploads in local-storage mode (development). In production, media comes from its own
 * origin through Caddy, which does the same (byte ranges for video seeking). Downloads go
 * through /api/media/download.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const missing = () =>
    new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (env().STORAGE_DRIVER !== 'local') return missing();
  const key = (await params).key.join('/');
  if (!STORED_KEY_RE.test(key)) return missing();
  const ext = key.split('.').pop()!;
  const headers: Record<string, string> = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    'cross-origin-resource-policy': 'same-site',
    'accept-ranges': 'bytes',
  };
  // Stream just the bytes asked for (video seeking) rather than reading the whole file.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const whole = await storage().open(key, { start: 0, end: 0 });
    if (!whole) return missing();
    await whole.body.cancel();
    const size = whole.size;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    const part = await storage().open(key, { start, end });
    if (!part) return missing();
    return new Response(part.body, {
      status: 206,
      headers: {
        ...headers,
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': String(end - start + 1),
      },
    });
  }
  const file = await storage().open(key);
  if (!file) return missing();
  return new Response(file.body, {
    headers: { ...headers, 'content-length': String(file.size) },
  });
}
