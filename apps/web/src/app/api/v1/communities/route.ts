import { apiCommunities } from '@gamecentral/core';
import { apiV1, queryOf } from '@/lib/api-v1';

/** The public community directory (Explore): ?q=, ?game=, ?tag=, ?region=, ?language=, ?sort=. */
export async function GET(req: Request) {
  return apiV1(req, () => apiCommunities(queryOf(req)));
}
