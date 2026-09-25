import { searchCommunities } from '@magnox/core';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = Math.min(10, Number(url.searchParams.get('limit') ?? 6) || 6);
  if (q.length < 2) return Response.json({ communities: [] });
  const communities = await searchCommunities(q, limit);
  return Response.json({ communities }, { headers: { 'cache-control': 'private, max-age=10' } });
}
