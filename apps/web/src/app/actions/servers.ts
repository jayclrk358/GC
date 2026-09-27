'use server';

import { revalidatePath } from 'next/cache';
import {
  addServer,
  castVote,
  getMemberContext,
  getServerIntegrations,
  removeServer,
  requestRefresh,
  sendTestVote,
  updateServer,
  updateServerIntegrations,
} from '@magnox/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';
import { clientIp } from '@/lib/request';

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

export async function getServerIntegrationsAction(communityId: string, id: string) {
  return runAction(async () => getServerIntegrations(await ctxFor(communityId), id));
}

export async function updateServerIntegrationsAction(
  communityId: string,
  id: string,
  input: unknown,
) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateServerIntegrations(ctx, id, input);
  });
}

export async function testVotifierAction(communityId: string, id: string, username: string) {
  return runAction(async () => sendTestVote(await ctxFor(communityId), id, String(username)));
}

export async function voteServerAction(serverId: string, input: unknown) {
  return runAction(async () => {
    const user = await getUser();
    const result = await castVote(user?.id ?? null, serverId, input, { ip: await clientIp() });
    revalidatePath(`/servers/${serverId}`);
    return result;
  });
}
