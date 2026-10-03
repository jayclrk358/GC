import { apiCommunityContext, apiEvents } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ slug: string }> };

/** Upcoming events (each date of a repeating event separately). */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return apiV1(req, async (caller) => apiEvents(await apiCommunityContext(slug, caller.userId)));
}
