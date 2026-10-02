import { apiCommunityContext, apiServers } from '@magnox/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** The community's game servers and their live status. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) => apiServers(await apiCommunityContext(slug, caller.userId)));
}
