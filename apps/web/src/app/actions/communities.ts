'use server';

import { revalidatePath } from 'next/cache';
import {
  changeSlug,
  createCommunity,
  deleteCommunity,
  getMemberContext,
  getOnboarding,
  joinCommunity,
  leaveCommunity,
  setArchived,
  transferOwnership,
  unauthorized,
  updateCommunityBasics,
  updateCommunityNav,
  updateCommunitySettings,
  updateCommunityTheme,
} from '@gamecentral/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

async function ctxFor(communityId: string) {
  const user = await getUser();
  return getMemberContext({ id: communityId }, user?.id ?? null);
}

export async function createCommunityAction(input: unknown) {
  return runAction(async () => {
    const user = await getUser();
    if (!user) throw unauthorized();
    return createCommunity(user.id, input);
  });
}

export async function updateBasicsAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateCommunityBasics(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function changeSlugAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const slug = await changeSlug(ctx, input);
    revalidatePath(`/c/${slug}`, 'layout');
    return { slug };
  });
}

export async function updateThemeAction(communityId: string, theme: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateCommunityTheme(ctx, theme);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function updateNavAction(communityId: string, nav: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateCommunityNav(ctx, nav);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function updateSettingsAction(communityId: string, settings: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateCommunitySettings(ctx, settings);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function deleteCommunityAction(communityId: string, confirmSlug: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await deleteCommunity(ctx, confirmSlug);
  });
}

export async function transferOwnershipAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await transferOwnership(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function setArchivedAction(communityId: string, archived: boolean) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await setArchived(ctx, archived === true);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    revalidatePath('/explore');
  });
}

export async function joinAction(communityId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await joinCommunity(ctx);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    return { welcome: (await getOnboarding(ctx.community.id)).enabled };
  });
}

export async function leaveAction(communityId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await leaveCommunity(ctx);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}
