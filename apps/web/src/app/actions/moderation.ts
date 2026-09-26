'use server';

import { revalidatePath } from 'next/cache';
import { banMember, kickMember, resolveReport, timeoutMember, unbanMember } from '@magnox/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

export async function kickAction(communityId: string, userId: string, reason: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await kickMember(ctx, userId, reason);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function banAction(communityId: string, userId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await banMember(ctx, userId, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function unbanAction(communityId: string, userId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await unbanMember(ctx, userId);
    revalidatePath(`/c/${ctx.community.slug}/settings/bans`);
  });
}

export async function timeoutAction(communityId: string, userId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await timeoutMember(ctx, userId, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function resolveReportAction(communityId: string, reportId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await resolveReport(ctx, reportId, input);
    revalidatePath(`/c/${ctx.community.slug}/settings/reports`);
  });
}
