import { apiCommunity, apiCommunityContext } from '@magnox/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) => apiCommunity(await apiCommunityContext(slug, caller.userId)));
}
