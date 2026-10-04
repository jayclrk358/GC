import { apiServerSearch } from '@gamecentral/core';
import { apiV1, queryOf } from '@/lib/api-v1';

/** The public server browser: ?q=, ?game=, ?tag=, ?region=, ?online=, ?minPlayers=, ?sort=. */
export async function GET(req: Request) {
  return apiV1(req, () => apiServerSearch(queryOf(req)));
}
