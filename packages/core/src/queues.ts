import { Queue, type JobsOptions } from 'bullmq';
import { queueRedis } from './redis';

export const QUEUES = {
  /** Scheduler tick + individual server status polls. */
  poll: 'server-poll',
  /** Periodic housekeeping: rollups, partition management, cleanup. */
  maintenance: 'maintenance',
  /** Fan-out of notifications and emails. */
  notify: 'notifications',
  /** Link previews for chat messages (outbound fetches behind the SSRF guard). */
  previews: 'link-previews',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const queues = new Map<string, Queue>();

export function queue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: queueRedis(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 5000, age: 24 * 3600 },
      },
    });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue(
  name: QueueName,
  jobName: string,
  data: unknown,
  opts?: JobsOptions,
): Promise<void> {
  await queue(name).add(jobName, data, opts);
}
