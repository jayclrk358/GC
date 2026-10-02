import { apiChannelContext, apiMessages, apiSendMessage } from '@magnox/core';
import { apiV1, jsonBody, queryOf } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** A chat channel's messages, newest last (?before=, ?after=, ?limit=). */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, async (caller) =>
    apiMessages(await apiChannelContext(id, caller.userId), id, queryOf(req)),
  );
}

/** Post a message as the token's owner (needs a token that can post). */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await jsonBody(req);
  return apiV1(
    req,
    async (caller) => apiSendMessage(await apiChannelContext(id, caller.userId), id, body),
    { write: true, status: 201 },
  );
}
