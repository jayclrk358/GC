'use server';

import { revalidatePath } from 'next/cache';
import {
  blockUser,
  markNotificationsRead,
  setMute,
  unauthorized,
  unblockUser,
  updateNotificationSettings,
} from '@magnox/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

async function userId() {
  const user = await getUser();
  if (!user) throw unauthorized();
  return user.id;
}

export async function markReadAction(ids: string[] | 'all') {
  return runAction(async () => {
    await markNotificationsRead(await userId(), ids);
    revalidatePath('/notifications');
  });
}

export async function updateNotificationSettingsAction(input: unknown) {
  return runAction(async () => updateNotificationSettings(await userId(), input));
}

export async function setMuteAction(input: unknown, muted: boolean) {
  return runAction(async () => setMute(await userId(), input, muted));
}

export async function blockUserAction(blockedId: string) {
  return runAction(async () => {
    await blockUser(await userId(), blockedId);
    revalidatePath('/settings/privacy');
  });
}

export async function unblockUserAction(blockedId: string) {
  return runAction(async () => {
    await unblockUser(await userId(), blockedId);
    revalidatePath('/settings/privacy');
  });
}
