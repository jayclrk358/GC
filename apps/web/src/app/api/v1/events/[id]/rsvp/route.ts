import { apiEventContext, apiRsvp } from '@gamecentral/core';
import { apiV1, jsonBody } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** Answer an event as the token's owner: going, maybe, declined, or null to take it back. */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await jsonBody(req);
  return apiV1(req, async (caller) => apiRsvp(await apiEventContext(id, caller.userId), id, body), {
    write: true,
  });
}
