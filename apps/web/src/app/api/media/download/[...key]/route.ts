import { attachmentDisposition, storage, uploadDownloadName } from '@magnox/core';
import { mediaUrl } from '@/lib/media';

/**
 * Saves an upload under the name it was uploaded with, instead of opening it. Browsers ignore
 * `<a download>` for files on another origin, so Download buttons link here. In S3 mode this
 * redirects to a short-lived signed link that tells the bucket to send it as a download (the
 * file still comes straight from the bucket); with local storage the file is sent from here.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  if (!mediaUrl(key)) return new Response('Not found', { status: 404 });
  const filename = await uploadDownloadName(key);
  const signed = await storage().downloadUrl(key, filename);
  if (signed) {
    return new Response(null, {
      status: 302,
      headers: { location: signed, 'cache-control': 'no-store' },
    });
  }
  const file = await storage().open(key);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(file.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(file.size),
      'content-disposition': attachmentDisposition(filename),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
