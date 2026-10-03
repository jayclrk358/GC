'use server';

import { revalidatePath } from 'next/cache';
import { acceptInvite, createInvite, getMemberContext, revokeInvite } from '@gamecentral/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

export async function createInviteAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const user = await getUser();
    const ctx = await getMemberContext({ id: communityId }, user?.id ?? null);
    const invite = await createInvite(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}/settings/invites`);
    return invite;
  });
}

export async function revokeInviteAction(communityId: string, code: string) {
  return runAction(async () => {
    const user = await getUser();
    const ctx = await getMemberContext({ id: communityId }, user?.id ?? null);
    await revokeInvite(ctx, code);
    revalidatePath(`/c/${ctx.community.slug}/settings/invites`);
  });
}

export async function acceptInviteAction(code: string) {
  return runAction(async () => {
    const user = await getUser();
    const result = await acceptInvite(user?.id ?? null, code);
    revalidatePath(`/c/${result.slug}`, 'layout');
    return result;
  });
}
