import { listEmoji } from '@magnox/core';
import { communityJson } from '@/lib/api';

/** The community's custom emoji, for ":" suggestions in editors. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return communityJson(id, async (ctx) => ({
    items: ctx.community.visibility === 'private' && !ctx.isMember ? [] : await listEmoji(id),
  }));
}
