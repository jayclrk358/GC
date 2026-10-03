import { channelUnreads, listVisibleChannels } from '@gamecentral/core';
import { communityJson } from '@/lib/api';

/** Unread and mention counts for every text channel (used after reconnecting). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return communityJson(id, async (ctx) => {
    const { channels } = await listVisibleChannels(ctx, { types: ['text'] });
    const map = await channelUnreads(
      ctx,
      channels.map((c) => c.id),
    );
    return { unreads: Object.fromEntries(map) };
  });
}
