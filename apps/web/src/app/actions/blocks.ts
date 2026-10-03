'use server';

import { revalidatePath } from 'next/cache';
import {
  addBlock,
  deleteBlock,
  getMemberContext,
  reorderBlocks,
  updateBlock,
} from '@gamecentral/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

async function ctxFor(communityId: string) {
  const user = await getUser();
  return getMemberContext({ id: communityId }, user?.id ?? null);
}

export async function addBlockAction(communityId: string, type: unknown, config?: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const block = await addBlock(ctx, type, config);
    revalidatePath(`/c/${ctx.community.slug}`);
    return block;
  });
}

export async function updateBlockAction(
  communityId: string,
  id: string,
  patch: { config?: unknown; visible?: boolean },
) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateBlock(ctx, id, patch);
    revalidatePath(`/c/${ctx.community.slug}`);
  });
}

export async function reorderBlocksAction(communityId: string, ids: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await reorderBlocks(ctx, ids);
    revalidatePath(`/c/${ctx.community.slug}`);
  });
}

export async function deleteBlockAction(communityId: string, id: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await deleteBlock(ctx, id);
    revalidatePath(`/c/${ctx.community.slug}`);
  });
}
