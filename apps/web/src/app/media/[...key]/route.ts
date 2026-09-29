import { env, storage } from '@magnox/core';

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
  if (env().STORAGE_DRIVER !== 'local') return new Response('Not found', { status: 404 });
  const key = (await params).key.join('/');
  if (!/^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif|mp4|webm)$/.test(key))
    return new Response('Not found', { status: 404 });
  const body = await storage().get(key);
  if (!body) return new Response('Not found', { status: 404 });
  const ext = key.split('.').pop()!;
  const headers: Record<string, string> = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    'cross-origin-resource-policy': 'same-site',
    'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const size = body.byteLength;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    return new Response(new Uint8Array(body.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}` },
    });
  }
  return new Response(new Uint8Array(body), { headers });
}
