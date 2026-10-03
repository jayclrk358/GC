'use server';

import { revalidatePath } from 'next/cache';
import {
  completeOnboarding,
  reviewApplication,
  saveApplicationForm,
  saveOnboarding,
  submitApplication,
  withdrawApplication,
} from '@gamecentral/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

export async function submitApplicationAction(communityId: string, answers: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await submitApplication(ctx, answers);
    revalidatePath(`/c/${ctx.community.slug}/apply`);
  });
}

export async function withdrawApplicationAction(communityId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await withdrawApplication(ctx);
    revalidatePath(`/c/${ctx.community.slug}/apply`);
  });
}

export async function reviewApplicationAction(
  communityId: string,
  applicationId: string,
  input: unknown,
) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await reviewApplication(ctx, applicationId, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function saveApplicationFormAction(communityId: string, form: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await saveApplicationForm(ctx, form);
    revalidatePath(`/c/${ctx.community.slug}/settings/applications`, 'layout');
  });
}

export async function saveOnboardingAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await saveOnboarding(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function completeOnboardingAction(communityId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await completeOnboarding(ctx);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    return { slug: ctx.community.slug };
  });
}
