import { apiCommunityContext, apiRoles } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** The community's roles, highest first. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) => apiRoles(await apiCommunityContext(slug, caller.userId)));
}
