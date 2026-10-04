import { apiCommunityContext, apiWikiPage } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string; page: string }> };

/** One wiki page, with its text. */
export async function GET(req: Request, { params }: Params) {
  const { slug, page } = await params;
  return apiV1(req, async (caller) =>
    apiWikiPage(await apiCommunityContext(slug, caller.userId), page),
  );
}
