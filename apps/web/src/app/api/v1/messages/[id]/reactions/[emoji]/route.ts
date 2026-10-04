import { apiMessageContext, apiReact } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ id: string; emoji: string }> };

/** React to a message as the token's owner (doing it again changes nothing). */
export async function PUT(req: Request, { params }: Params) {
  const { id, emoji } = await params;
  return apiV1(
    req,
    async (caller) => apiReact(await apiMessageContext(id, caller.userId), id, emoji, true),
    { write: true },
  );
}

/** Take the token owner's reaction back. */
export async function DELETE(req: Request, { params }: Params) {
  const { id, emoji } = await params;
  return apiV1(
    req,
    async (caller) => apiReact(await apiMessageContext(id, caller.userId), id, emoji, false),
    { write: true },
  );
}
