'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { replyToMyFeedback, submitFeedback } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

export async function submitFeedbackAction(input: unknown) {
  return runAction(async () => {
    const user = await getUser();
    const userAgent = (await headers()).get('user-agent');
    const r = await submitFeedback(user?.id ?? null, input, { userAgent });
    revalidatePath('/feedback');
    return r;
  });
}

export async function replyToFeedbackAction(feedbackId: string, input: unknown) {
  return runAction(async () => {
    const user = await getUser();
    await replyToMyFeedback(user?.id ?? null, feedbackId, input);
    revalidatePath(`/feedback/${feedbackId}`);
  });
}
