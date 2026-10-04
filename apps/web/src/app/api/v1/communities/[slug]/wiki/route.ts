import { apiCommunityContext, apiWikiPages } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** Every wiki page, in the wiki's order (parents before their children). */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) => apiWikiPages(await apiCommunityContext(slug, caller.userId)));
}
