import { apiMe } from '@magnox/core';
import { apiV1 } from '@/lib/api-v1';

/** The token's owner and the communities they're in. */
export async function GET(req: Request) {
  return apiV1(req, (caller) => apiMe(caller.userId));
}
