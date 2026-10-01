import { emojiImageUrl } from '@magnox/core';

/** A custom emoji's picture: posts only store the emoji's id, so this points at its file. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = await emojiImageUrl((await params).id);
  if (!url) {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'public, max-age=60' },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { location: url, 'cache-control': 'public, max-age=3600' },
  });
}
