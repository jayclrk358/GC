'use server';

import { revalidatePath } from 'next/cache';
import {
  adminDeleteUser,
  adminRemoveContent,
  adminReplyFeedback,
  adminSetFeedbackStatus,
  adminUpdateUser,
  banUser,
  disconnectUser,
  setStaffRole,
  giftPlan,
  removePlanGift,
  revokeSessions,
  suspendCommunity,
  unbanUser,
  unsuspendCommunity,
} from '@gamecentral/core';
import { endSessions, getUser, refreshSessions } from '@/lib/auth';
import { runAction } from '@/lib/action';

// Platform admin actions. Each service checks the caller is a Game Central admin.

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

export async function setStaffRoleAction(input: unknown) {
  return runAction(async () => {
    await setStaffRole(await me(), input);
    revalidatePath('/admin', 'layout');
  });
}

export async function updateUserAction(userId: string, input: unknown) {
  return runAction(async () => {
    await adminUpdateUser(await me(), userId, input);
    await refreshSessions(userId);
    revalidatePath('/admin', 'layout');
  });
}

export async function deleteUserAction(userId: string, input: unknown) {
  return runAction(async () => {
    await adminDeleteUser(await me(), userId, input);
    await endSessions(userId);
    disconnectUser(userId);
    revalidatePath('/admin', 'layout');
  });
}

export async function removeContentAction(input: unknown) {
  return runAction(async () => {
    await adminRemoveContent(await me(), input);
    revalidatePath('/admin/content');
  });
}

export async function replyFeedbackAction(feedbackId: string, input: unknown) {
  return runAction(async () => {
    await adminReplyFeedback(await me(), feedbackId, input);
    revalidatePath('/admin', 'layout');
  });
}

export async function setFeedbackStatusAction(feedbackId: string, input: unknown) {
  return runAction(async () => {
    await adminSetFeedbackStatus(await me(), feedbackId, input);
    revalidatePath('/admin', 'layout');
  });
}
