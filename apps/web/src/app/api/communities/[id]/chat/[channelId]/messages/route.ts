import { listMessages } from '@magnox/core';
import { communityJson } from '@/lib/api';

type Params = { params: Promise<{ id: string; channelId: string }> };

/** History: newest page, or ?before= / ?after= / ?around= a message id. */
export async function GET(req: Request, { params }: Params) {
  const { id, channelId } = await params;
  const sp = new URL(req.url).searchParams;
  const opt = (k: string) => sp.get(k) || undefined;
  return communityJson(id, (ctx) =>
    listMessages(ctx, channelId, {
      before: opt('before'),
      after: opt('after'),
      around: opt('around'),
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    }),
  );
}
