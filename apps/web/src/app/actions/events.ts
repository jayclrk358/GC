'use server';

import { revalidatePath } from 'next/cache';
import {
  cancelEvent,
  cancelOccurrence,
  createEvent,
  deleteEvent,
  rsvpEvent,
  updateEvent,
} from '@gamecentral/core';
import { runAction } from '@/lib/action';
import { ctxFor } from './_ctx';

const eventsPath = (slug: string) => `/c/${slug}/events`;

export async function createEventAction(communityId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    const { id } = await createEvent(ctx, input);
    revalidatePath(eventsPath(ctx.community.slug), 'layout');
    return { id, slug: ctx.community.slug };
  });
}

export async function updateEventAction(communityId: string, eventId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await updateEvent(ctx, eventId, input);
    revalidatePath(eventsPath(ctx.community.slug), 'layout');
    return { id: eventId, slug: ctx.community.slug };
  });
}

export async function cancelEventAction(communityId: string, eventId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await cancelEvent(ctx, eventId);
    revalidatePath(eventsPath(ctx.community.slug), 'layout');
  });
}

export async function cancelOccurrenceAction(communityId: string, eventId: string, at: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await cancelOccurrence(ctx, eventId, new Date(at));
    revalidatePath(eventsPath(ctx.community.slug), 'layout');
  });
}

export async function deleteEventAction(communityId: string, eventId: string) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    await deleteEvent(ctx, eventId);
    revalidatePath(eventsPath(ctx.community.slug), 'layout');
    return { slug: ctx.community.slug };
  });
}

export async function rsvpAction(
  communityId: string,
  eventId: string,
  at: string,
  status: unknown,
) {
  return runAction(async () => {
    const ctx = await ctxFor(communityId);
    return rsvpEvent(ctx, eventId, new Date(at), status);
  });
}
