import { apiServerHistory } from '@gamecentral/core';
import { apiV1, queryOf } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** A server's player counts and uptime over ?range=24h, 7d or 30d. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, (caller) => apiServerHistory(id, caller.userId, queryOf(req)));
}
