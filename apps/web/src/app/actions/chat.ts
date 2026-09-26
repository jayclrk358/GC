'use server';

import {
  ackChannel,
  deleteMessage,
  editMessage,
  sendMessage,
  setMessagePinned,
  toggleMessageReaction,
} from '@magnox/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

// Chat writes never revalidate pages: clients update from the realtime events instead.

export async function sendMessageAction(communityId: string, channelId: string, input: unknown) {
  return runAction(async () => sendMessage(await ctxFor(communityId), channelId, input));
}

export async function editMessageAction(communityId: string, messageId: string, input: unknown) {
  return runAction(async () => editMessage(await ctxFor(communityId), messageId, input));
}

export async function deleteMessageAction(communityId: string, messageId: string) {
  return runAction(async () => deleteMessage(await ctxFor(communityId), messageId));
}

export async function toggleMessageReactionAction(
  communityId: string,
  messageId: string,
  emoji: string,
) {
  return runAction(async () => toggleMessageReaction(await ctxFor(communityId), messageId, emoji));
}

export async function setMessagePinnedAction(
  communityId: string,
  messageId: string,
  pinned: boolean,
) {
  return runAction(async () => setMessagePinned(await ctxFor(communityId), messageId, pinned));
}

export async function ackChannelAction(communityId: string, channelId: string, messageId: string) {
  return runAction(async () => ackChannel(await ctxFor(communityId), channelId, messageId));
}
