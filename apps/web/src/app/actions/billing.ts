'use server';

import { revalidatePath } from 'next/cache';
import {
  changePlan,
  createBillingPortal,
  createCheckout,
  getMemberContext,
  setPlanCancellation,
  unauthorized,
} from '@gamecentral/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

async function ctxFor(communityId: string) {
  const user = await getUser();
  if (!user) throw unauthorized();
  return getMemberContext({ id: communityId }, user.id);
}

/** Start Stripe Checkout; the page then sends the browser to the returned URL. */
export async function startCheckoutAction(communityId: string, plan: string, interval: string) {
  return runAction(async () => createCheckout(await ctxFor(communityId), { plan, interval }));
}

export async function changePlanAction(communityId: string, plan: string, interval: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await changePlan(ctx, { plan, interval });
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function setCancellationAction(communityId: string, cancel: boolean) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await setPlanCancellation(ctx, cancel);
    revalidatePath(`/c/${ctx.community.slug}/settings/billing`);
  });
}

export async function billingPortalAction(communityId: string) {
  return runAction(async () => createBillingPortal(await ctxFor(communityId)));
}
