import type { Job } from 'bullmq';
import { logger, processFanout, processLinkPreviews, type FanoutJob } from '@magnox/core';
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
  'maintenance-hourly': async () => {
    await wakeHotDormant();
    return null;
  },
};
