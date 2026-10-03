'use server';

import { revalidatePath } from 'next/cache';
import { resumeJoins, reviewHeldPost, saveAutomod } from '@gamecentral/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

export async function saveAutomodAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await saveAutomod(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}/settings/automod`);
  });
}

export async function resumeJoinsAction(communityId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await resumeJoins(ctx);
    revalidatePath(`/c/${ctx.community.slug}/settings/automod`);
  });
}

export async function reviewHeldPostAction(communityId: string, id: string, decision: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const r = await reviewHeldPost(ctx, id, decision);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    return r;
  });
}
