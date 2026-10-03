'use server';

import { revalidatePath } from 'next/cache';
import {
  createChannel,
  deleteChannel,
  listOverwrites,
  reorderChannels,
  setChatBackgroundEverywhere,
  setOverwrite,
  updateChannel,
} from '@gamecentral/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

export async function createChannelAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const row = await createChannel(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    return { id: row.id };
  });
}

export async function updateChannelAction(communityId: string, id: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateChannel(ctx, id, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function deleteChannelAction(communityId: string, id: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await deleteChannel(ctx, id);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function reorderChannelsAction(communityId: string, ids: string[]) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await reorderChannels(ctx, ids);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function listOverwritesAction(communityId: string, channelId: string) {
  return runAction(async () => listOverwrites(await ctxFor(communityId), channelId));
}

export async function setOverwriteAction(communityId: string, channelId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await setOverwrite(ctx, channelId, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function setChatBackgroundEverywhereAction(
  communityId: string,
  backgroundKey: string | null,
  backgroundDim: number,
) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await setChatBackgroundEverywhere(ctx, backgroundKey, backgroundDim);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}
