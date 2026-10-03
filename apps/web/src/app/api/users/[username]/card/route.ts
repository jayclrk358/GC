import { getProfileCard } from '@gamecentral/core';
import { getUser } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The profile card shown when hovering someone's name. `?community=` adds their roles there. */
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[a-z0-9_.-]{1,40}$/i.test(username)) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const community = new URL(req.url).searchParams.get('community');
  const viewer = await getUser();
  const card = await getProfileCard(username, {
    communityId: community && UUID_RE.test(community) ? community : null,
    viewerId: viewer?.id ?? null,
  });
  if (!card) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(card, { headers: { 'cache-control': 'private, max-age=60' } });
}
