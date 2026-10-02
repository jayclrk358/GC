'use server';

import { revalidatePath } from 'next/cache';
import {
  createApiToken,
  createWebhook,
  deleteWebhook,
  removeCustomDomain,
  removeDiscordLink,
  revokeApiToken,
  saveDiscordLink,
  setCustomDomain,
  setWebhookActive,
  syncDiscordNow,
  testWebhook,
  verifyCustomDomain,
} from '@magnox/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

// ── Personal API tokens ────────────────────────────────────────────────────

export async function createApiTokenAction(input: unknown) {
  return runAction(async () => {
    const r = await createApiToken((await getUser())?.id ?? null, input);
    revalidatePath('/settings/developer');
    return r;
  });
}

export async function revokeApiTokenAction(id: string) {
  return runAction(async () => {
    await revokeApiToken((await getUser())?.id ?? null, id);
    revalidatePath('/settings/developer');
  });
}

// ── Community webhooks and Discord ─────────────────────────────────────────

async function integrations(communityId: string) {
  const ctx = await ctxFor(communityId);
  return { ctx, path: `/c/${ctx.community.slug}/settings/integrations` };
}

export async function createWebhookAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const { ctx, path } = await integrations(communityId);
    const r = await createWebhook(ctx, input);
    revalidatePath(path);
    return r;
  });
}

export async function setWebhookActiveAction(communityId: string, id: string, active: boolean) {
  return runAction(async () => {
    const { ctx, path } = await integrations(communityId);
    await setWebhookActive(ctx, id, active);
    revalidatePath(path);
  });
}

export async function deleteWebhookAction(communityId: string, id: string) {
  return runAction(async () => {
    const { ctx, path } = await integrations(communityId);
    await deleteWebhook(ctx, id);
    revalidatePath(path);
  });
}

export async function testWebhookAction(communityId: string, id: string) {
  return runAction(async () => {
    const { ctx, path } = await integrations(communityId);
    const r = await testWebhook(ctx, id);
    revalidatePath(path);
    return r;
  });
}

export async function saveDiscordLinkAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const { ctx, path } = await integrations(communityId);
    await saveDiscordLink(ctx, input);
    revalidatePath(path);
  });
}

export async function removeDiscordLinkAction(communityId: string) {
  return runAction(async () => {
    const { ctx, path } = await integrations(communityId);
    await removeDiscordLink(ctx);
    revalidatePath(path);
  });
}

export async function syncDiscordAction(communityId: string) {
  return runAction(async () => {
    const { ctx, path } = await integrations(communityId);
    await syncDiscordNow(ctx);
    revalidatePath(path);
  });
}

// ── Custom domain ──────────────────────────────────────────────────────────

async function domainSettings(communityId: string) {
  const ctx = await ctxFor(communityId);
  return { ctx, path: `/c/${ctx.community.slug}/settings/domain` };
}

export async function setCustomDomainAction(communityId: string, domain: string) {
  return runAction(async () => {
    const { ctx, path } = await domainSettings(communityId);
    await setCustomDomain(ctx, domain);
    revalidatePath(path);
  });
}

export async function removeCustomDomainAction(communityId: string) {
  return runAction(async () => {
    const { ctx, path } = await domainSettings(communityId);
    await removeCustomDomain(ctx);
    revalidatePath(path);
  });
}

export async function verifyCustomDomainAction(communityId: string) {
  return runAction(async () => {
    const { ctx, path } = await domainSettings(communityId);
    const r = await verifyCustomDomain(ctx);
    revalidatePath(path);
    return r;
  });
}
