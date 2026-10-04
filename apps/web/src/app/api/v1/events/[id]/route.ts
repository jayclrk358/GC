import { apiEvent, apiEventContext } from '@gamecentral/core';
import { apiV1, queryOf } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** An event at one of its dates (the next one, or ?at=), with who's coming. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, async (caller) =>
    apiEvent(await apiEventContext(id, caller.userId), id, queryOf(req)),
  );
}
