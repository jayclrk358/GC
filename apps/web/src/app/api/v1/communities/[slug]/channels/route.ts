import { apiChannels, apiCommunityContext } from '@magnox/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** The channels the token's owner can see. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) => ({
    channels: await apiChannels(await apiCommunityContext(slug, caller.userId)),
  }));
}
