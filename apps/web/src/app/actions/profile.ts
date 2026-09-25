'use server';

import { revalidatePath } from 'next/cache';
import { unauthorized, updateProfile } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

export async function updateProfileAction(input: unknown) {
  return runAction(async () => {
    const user = await getUser();
    if (!user) throw unauthorized();
    await updateProfile(user.id, input);
    const username = (user as { username?: string | null }).username;
    if (username) revalidatePath(`/u/${username}`);
    revalidatePath('/settings/profile');
  });
}
