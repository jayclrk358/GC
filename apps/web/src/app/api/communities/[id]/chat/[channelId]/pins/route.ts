import { listPins } from '@gamecentral/core';
import { communityJson } from '@/lib/api';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; channelId: string }> },
) {
  const { id, channelId } = await params;
  return communityJson(id, async (ctx) => ({ messages: await listPins(ctx, channelId) }));
}
