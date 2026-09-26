'use server';

import { revalidatePath } from 'next/cache';
import {
  addServer,
  getMemberContext,
  removeServer,
  requestRefresh,
  updateServer,
} from '@magnox/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

async function ctxFor(communityId: string) {
  const user = await getUser();
  return getMemberContext({ id: communityId }, user?.id ?? null);
}

export async function addServerAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const view = await addServer(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    return view;
  });
}

export async function updateServerAction(communityId: string, id: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateServer(ctx, id, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function removeServerAction(communityId: string, id: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await removeServer(ctx, id);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function refreshServerAction(communityId: string, id: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    return requestRefresh(ctx, id);
  });
}
