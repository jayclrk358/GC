import { apiCommunityContext, apiMembers } from '@gamecentral/core';
import { apiV1, queryOf } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** The community's members, oldest first (?q=, ?role=, ?page=, ?limit=). */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) =>
    apiMembers(await apiCommunityContext(slug, caller.userId), queryOf(req)),
  );
}
