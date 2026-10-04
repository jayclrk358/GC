import { apiThread, apiThreadContext } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** A forum thread. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, async (caller) => apiThread(await apiThreadContext(id, caller.userId), id));
}
