import { storage } from '@magnox/core';
import { mediaUrl } from '@/lib/media';

/**
 * Saves an upload instead of opening it. Browsers ignore `<a download>` for files on another
 * origin, so the Download buttons link here and get sent on to the file with a header that makes
 * it a download: a short-lived signed link in S3 mode (the file still comes straight from the
 * bucket), or the media server's own `?download=1` in local mode.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  const url = mediaUrl(key);
  if (!url) return new Response('Not found', { status: 404 });
  const signed = await storage().downloadUrl(key, `magnox-${key.slice(2)}`);
  return new Response(null, {
    status: 302,
    headers: { location: signed ?? `${url}?download=1`, 'cache-control': 'no-store' },
  });
}
