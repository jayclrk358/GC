import { apiPosts, apiReply, apiThreadContext } from '@gamecentral/core';
import { apiV1, jsonBody, queryOf } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** A thread's posts, oldest first, a page at a time (?page=, ?limit=). */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, async (caller) =>
    apiPosts(await apiThreadContext(id, caller.userId), id, queryOf(req)),
  );
}

/** Reply in a thread as the token's owner. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await jsonBody(req);
  return apiV1(
    req,
    async (caller) => apiReply(await apiThreadContext(id, caller.userId), id, body),
    { write: true, status: 201 },
  );
}
