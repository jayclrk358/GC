import { apiChannelContext, apiPins } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** A chat channel's pinned messages. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, async (caller) => apiPins(await apiChannelContext(id, caller.userId), id));
}
