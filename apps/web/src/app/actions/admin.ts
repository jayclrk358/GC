'use server';

import { revalidatePath } from 'next/cache';
import {
  banUser,
  disconnectUser,
  giftPlan,
  removePlanGift,
  revokeSessions,
  suspendCommunity,
  unbanUser,
  unsuspendCommunity,
} from '@magnox/core';
import { endSessions, getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

// Platform admin actions. Each service checks the caller is a Magnox admin.

const me = async () => (await getUser())?.id ?? null;

export async function giftPlanAction(communityId: string, input: unknown) {
  return runAction(async () => {
    await giftPlan(await me(), communityId, input);
    revalidatePath('/admin', 'layout');
  });
}

export async function removePlanGiftAction(communityId: string) {
  return runAction(async () => {
    await removePlanGift(await me(), communityId);
    revalidatePath('/admin', 'layout');
  });
}

export async function suspendCommunityAction(communityId: string, input: unknown) {
  return runAction(async () => {
    await suspendCommunity(await me(), communityId, input);
    revalidatePath('/admin', 'layout');
  });
}

export async function unsuspendCommunityAction(communityId: string) {
  return runAction(async () => {
    await unsuspendCommunity(await me(), communityId);
    revalidatePath('/admin', 'layout');
  });
}

export async function banUserAction(userId: string, input: unknown) {
  return runAction(async () => {
    await banUser(await me(), userId, input);
    await endSessions(userId);
    // Again now that no copy of their sessions is left (a socket may have reconnected meanwhile).
    disconnectUser(userId);
    revalidatePath('/admin', 'layout');
  });
}

export async function unbanUserAction(userId: string) {
  return runAction(async () => {
    await unbanUser(await me(), userId);
    revalidatePath('/admin', 'layout');
  });
}

export async function revokeSessionsAction(userId: string) {
  return runAction(async () => {
    await revokeSessions(await me(), userId);
    await endSessions(userId);
    // Again now that no copy of their sessions is left (a socket may have reconnected meanwhile).
    disconnectUser(userId);
    revalidatePath('/admin', 'layout');
  });
}
