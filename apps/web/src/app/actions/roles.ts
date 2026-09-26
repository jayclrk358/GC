'use server';

import { revalidatePath } from 'next/cache';
import {
  createRole,
  deleteRole,
  getMemberContext,
  reorderRoles,
  roleSummary,
  setMemberRole,
  updateRole,
} from '@magnox/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

async function ctxFor(communityId: string) {
  const user = await getUser();
  return getMemberContext({ id: communityId }, user?.id ?? null);
}

export async function createRoleAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const role = await createRole(ctx, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
    return roleSummary(role);
  });
}

export async function updateRoleAction(communityId: string, roleId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateRole(ctx, roleId, input);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function deleteRoleAction(communityId: string, roleId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await deleteRole(ctx, roleId);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function reorderRolesAction(communityId: string, ids: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await reorderRoles(ctx, ids);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}

export async function setMemberRoleAction(
  communityId: string,
  userId: string,
  roleId: string,
  assign: boolean,
) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await setMemberRole(ctx, userId, roleId, assign);
    revalidatePath(`/c/${ctx.community.slug}`, 'layout');
  });
}
