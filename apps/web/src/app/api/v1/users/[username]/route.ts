import { apiUser } from '@gamecentral/core';
import { apiV1 } from '@/lib/api-v1';

type Params = { params: Promise<{ username: string }> };

/** Someone's public profile. */
export async function GET(req: Request, { params }: Params) {
  const { username } = await params;
  return apiV1(req, (caller) => apiUser(username, caller.userId));
}
