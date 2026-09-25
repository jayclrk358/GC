import type { Job } from 'bullmq';
import { logger } from '@magnox/core';

const log = logger('jobs');

export type Handler = (job: Job) => Promise<unknown>;

/** Job handlers by job name. Feature modules add their handlers here. */
export const handlers: Record<string, Handler> = {
  'poll-tick': async () => {
    // Game server polling is added in phase 1.
    return null;
  },
  'maintenance-hourly': async () => {
    log.debug('hourly maintenance');
    return null;
  },
};
