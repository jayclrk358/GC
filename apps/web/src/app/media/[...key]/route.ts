import { env, storage } from '@magnox/core';

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
};

/** Serves uploads in local-storage mode. In production, media comes from its own origin. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (env().STORAGE_DRIVER !== 'local') return new Response('Not found', { status: 404 });
  const key = (await params).key.join('/');
  if (!/^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/.test(key))
    return new Response('Not found', { status: 404 });
  const body = await storage().get(key);
  if (!body) return new Response('Not found', { status: 404 });
  const ext = key.split('.').pop()!;
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-site',
    },
  });
}
