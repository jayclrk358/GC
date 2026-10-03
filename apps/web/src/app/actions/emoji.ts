'use server';

import { revalidatePath } from 'next/cache';
import { createEmoji, deleteEmoji, renameEmoji } from '@gamecentral/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

export async function createEmojiAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const emoji = await createEmoji(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    return emoji;
  });
}

export async function renameEmojiAction(communityId: string, id: string, name: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await renameEmoji(ctx, id, name);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function deleteEmojiAction(communityId: string, id: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await deleteEmoji(ctx, id);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}
