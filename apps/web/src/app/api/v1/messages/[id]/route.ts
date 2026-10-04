import { apiDeleteMessage, apiEditMessage, apiMessage, apiMessageContext } from '@gamecentral/core';
import { apiV1, jsonBody } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string }> };

/** One chat message. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(req, async (caller) => apiMessage(await apiMessageContext(id, caller.userId), id));
}

/** Edit one of the token owner's own messages. */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await jsonBody(req);
  return apiV1(
    req,
    async (caller) => apiEditMessage(await apiMessageContext(id, caller.userId), id, body),
    { write: true },
  );
}

/** Delete a message: the token owner's own, or anyone's with Manage Messages. */
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  return apiV1(
    req,
    async (caller) => apiDeleteMessage(await apiMessageContext(id, caller.userId), id),
    { write: true },
  );
}
