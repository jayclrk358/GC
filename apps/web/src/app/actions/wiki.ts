'use server';

import { revalidatePath } from 'next/cache';
import {
  createWikiPage,
  deleteWikiPage,
  restoreRevision,
  setWikiProtected,
  updateWikiPage,
} from '@magnox/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

export async function createWikiPageAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const r = await createWikiPage(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}/wiki`, 'layout');
    return r;
  });
}

export async function updateWikiPageAction(communityId: string, pageId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const r = await updateWikiPage(ctx, pageId, input);
    revalidatePath(`/c/${ctx.community.slug}/wiki`, 'layout');
    return r;
  });
}

export async function restoreRevisionAction(communityId: string, pageId: string, revisionId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await restoreRevision(ctx, pageId, revisionId);
    revalidatePath(`/c/${ctx.community.slug}/wiki`, 'layout');
  });
}

export async function setWikiProtectedAction(communityId: string, pageId: string, value: boolean) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await setWikiProtected(ctx, pageId, value);
    revalidatePath(`/c/${ctx.community.slug}/wiki`, 'layout');
  });
}

export async function deleteWikiPageAction(communityId: string, pageId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await deleteWikiPage(ctx, pageId);
    revalidatePath(`/c/${ctx.community.slug}/wiki`, 'layout');
  });
}
