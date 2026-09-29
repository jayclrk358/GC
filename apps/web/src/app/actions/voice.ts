'use server';

import { joinVoice, moderateVoice } from '@magnox/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

/** A ticket to join a voice channel (see core's joinVoice). */
export async function joinVoiceAction(communityId: string, channelId: string) {
  return runAction(async () => joinVoice(await ctxFor(communityId), channelId));
}

/** Mute someone's microphone, or remove them from a voice channel (Mute members). */
export async function moderateVoiceAction(
  communityId: string,
  channelId: string,
  userId: string,
  action: 'mute' | 'disconnect',
) {
  return runAction(async () => moderateVoice(await ctxFor(communityId), channelId, userId, action));
}
