import { enforceRateLimit, searchMessages } from '@gamecentral/core';
import { communityJson } from '@/lib/api';
import { clientIp } from '@/lib/request';

const SLOW_DOWN = 'Too many searches. Please wait a moment.';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const ip = await clientIp();
  return communityJson(id, async (ctx) => {
    // Full-text search over a community's history is heavy: limited per visitor and per account.
    if (ip) await enforceRateLimit(`chat-search-ip:${ip}`, 20, 60, SLOW_DOWN);
    if (ctx.userId) await enforceRateLimit(`chat-search:${ctx.userId}`, 20, 60, SLOW_DOWN);
    return { results: await searchMessages(ctx, q) };
  });
}
