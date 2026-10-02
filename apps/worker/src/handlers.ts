import type { Job } from 'bullmq';
import {
  backfillImageVariants,
  cleanupMedia,
  cleanupUnverifiedServers,
  deliverVotifierVote,
  deliverWebhook,
  expirePlanGifts,
  logger,
  maintainHistory,
  type MediaCleanup,
  processFanout,
  processLinkPreviews,
  sendDigests,
  sendEventReminders,
  sendPushes,
  syncDiscordCommunity,
  syncDiscordMember,
  type PushItem,
  type FanoutJob,
  type WebhookJob,
} from '@magnox/core';
import { pollEndpoint, pollTick, wakeHotDormant } from './poll';

const log = logger('jobs');

export type Handler = (job: Job) => Promise<unknown>;

/** Job handlers by job name. */
export const handlers: Record<string, Handler> = {
  'poll-tick': async () => {
    const n = await pollTick();
    if (n) log.debug({ n }, 'enqueued polls');
    return n;
  },
  'poll-endpoint': async (job) => {
    const { endpointId } = job.data as { endpointId: string };
    await pollEndpoint(endpointId);
    return null;
  },
  fanout: async (job) => {
    await processFanout(job.data as FanoutJob);
    return null;
  },
  'link-preview': async (job) => {
    const { messageId } = job.data as { messageId: string };
    return processLinkPreviews(messageId);
  },
  votifier: async (job) => {
    const { voteId, address } = job.data as { voteId: string; address: string };
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    return deliverVotifierVote(voteId, address, final);
  },
  webhook: async (job) => {
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const result = await deliverWebhook(job.data as WebhookJob, final);
    // Throwing makes BullMQ try again later, with backoff.
    if (result === 'retry') throw new Error('Webhook delivery failed; will retry');
    return result;
  },
  'discord-member': async (job) => {
    const { communityId, userId } = job.data as { communityId: string; userId: string };
    await syncDiscordMember(communityId, userId);
    return null;
  },
  'discord-sync': async (job) => ({
    result: await syncDiscordCommunity((job.data as { communityId: string }).communityId),
  }),
  'media-cleanup': async (job) => ({ removed: await cleanupMedia(job.data as MediaCleanup) }),
  push: async (job) => ({ sent: await sendPushes((job.data as { items: PushItem[] }).items) }),
  'media-variants': async () => {
    let done = 0;
    for (let n = await backfillImageVariants(); n > 0; n = await backfillImageVariants()) done += n;
    return { done };
  },
  'history-maintenance': async () => maintainHistory(),
  'event-reminders': async () => ({ reminded: await sendEventReminders() }),
  'maintenance-hourly': async () => {
    await wakeHotDormant();
    const removed = await cleanupUnverifiedServers();
    const giftsEnded = await expirePlanGifts();
    const digests = await sendDigests();
    return { removed, giftsEnded, digests };
  },
};
