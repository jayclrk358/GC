'use server';

import { revalidatePath } from 'next/cache';
import {
  createFlair,
  createReply,
  createReport,
  createThread,
  deleteFlair,
  deletePost,
  editPost,
  markSolution,
  markThreadRead,
  moderateThread,
  postHistory,
  setFollow,
  toggleReaction,
  updateFlair,
  voteThread,
  votePoll,
} from '@gamecentral/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

export async function createThreadAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const r = await createThread(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}/forum`, 'layout');
    return { ...r, slug: ctx.community.slug };
  });
}

export async function createReplyAction(communityId: string, threadId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const r = await createReply(ctx, threadId, input);
    revalidatePath(`/c/${ctx.community.slug}/t/${threadId}`);
    return r;
  });
}

export async function editPostAction(
  communityId: string,
  postId: string,
  input: unknown,
  title?: string,
) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await editPost(ctx, postId, input, { title });
  });
}

export async function deletePostAction(communityId: string, postId: string, reason?: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    return deletePost(ctx, postId, reason);
  });
}

export async function postHistoryAction(communityId: string, postId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    return postHistory(ctx, postId);
  });
}

export async function toggleReactionAction(communityId: string, postId: string, emoji: string) {
  return runAction(async () => toggleReaction(await ctxFor(communityId), postId, emoji));
}

export async function voteThreadAction(communityId: string, threadId: string, value: number) {
  return runAction(async () => voteThread(await ctxFor(communityId), threadId, value));
}

export async function votePollAction(communityId: string, pollId: string, optionIds: string[]) {
  return runAction(async () => votePoll(await ctxFor(communityId), pollId, optionIds));
}

export async function moderateThreadAction(communityId: string, threadId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await moderateThread(ctx, threadId, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function markSolutionAction(
  communityId: string,
  threadId: string,
  postId: string | null,
) {
  return runAction(async () => markSolution(await ctxFor(communityId), threadId, postId));
}

export async function setFollowAction(communityId: string, threadId: string, follow: boolean) {
  return runAction(async () => setFollow(await ctxFor(communityId), threadId, follow));
}

export async function markThreadReadAction(threadId: string, lastPostId: string | null) {
  return runAction(async () => {
    const user = await getUser();
    if (user) await markThreadRead(user.id, threadId, lastPostId);
  });
}

export async function reportAction(communityId: string, input: unknown) {
  return runAction(async () => createReport(await ctxFor(communityId), input));
}

export async function createFlairAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const flair = await createFlair(await ctxFor(communityId), input);
    return { id: flair.id };
  });
}

export async function updateFlairAction(communityId: string, id: string, input: unknown) {
  return runAction(async () => updateFlair(await ctxFor(communityId), id, input));
}

export async function deleteFlairAction(communityId: string, id: string) {
  return runAction(async () => deleteFlair(await ctxFor(communityId), id));
}
