import 'server-only';
import { getMemberContext } from '@gamecentral/core';
import { getUser } from '@/lib/auth';

/** Member context for the signed-in user (or a guest) in a community. */
export async function ctxFor(communityId: string) {
  const user = await getUser();
  return getMemberContext({ id: communityId }, user?.id ?? null);
}
