import { apiServer } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** A listed game server and its live status. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, (caller) => apiServer(id, caller.userId));
}
