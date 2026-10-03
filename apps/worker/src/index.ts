import { createServer } from 'node:http';
import { Worker, type Job } from 'bullmq';
import {
  backfillHistory,
  closeRedis,
  env,
  flushTelemetry,
  initTelemetry,
  logger,
  QUEUES,
  queue,
  queueRedis,
  reportError,
  withSpan,
} from '@gamecentral/core';
import { sql } from '@gamecentral/db';
import { handlers } from './handlers';

const log = logger('worker');
// A stray rejected promise (a Redis or database blip outside any job) is logged and the worker
// carries on; Node would otherwise exit. An exception nothing caught leaves the process in an
// unknown state, so log it and exit for the container to restart.
process.on('unhandledRejection', (reason) => log.error({ err: reason }, 'unhandled rejection'));
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'uncaught exception');
  void flushTelemetry().finally(() => process.exit(1));
});
await initTelemetry('worker');

const workers: Worker[] = [];

function start(name: string, concurrency: number) {
  const w = new Worker(
    name,
    async (job: Job) => {
      const handler = handlers[job.name];
      if (!handler) throw new Error(`No handler for job ${job.name}`);
      return withSpan(`job ${job.name}`, { 'job.queue': name, 'job.id': job.id ?? '' }, () =>
        handler(job),
      );
    },
    { connection: queueRedis(), concurrency },
  );
  w.on('failed', (job, err) => {
    log.warn({ job: job?.name, id: job?.id, err: err.message }, 'job failed');
    // Only once it has run out of tries: retries are expected (a webhook endpoint that's down).
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      reportError(err, { job: job.name, queue: name, attempts: job.attemptsMade });
    }
  });
  w.on('error', (err) => log.error({ err }, 'worker error'));
  workers.push(w);
}

start(QUEUES.poll, 32);
start(QUEUES.maintenance, 1);
start(QUEUES.notify, 8);
start(QUEUES.previews, 4);
start(QUEUES.integrations, 4);
start(QUEUES.webhooks, 8);
start(QUEUES.media, 2);

// Sample partitions must exist before the first poll lands; rollups catch up after downtime.
await backfillHistory().catch((err) => log.error({ err }, 'history backfill failed'));

// Recurring schedules. upsertJobScheduler is idempotent across restarts and replicas.
await queue(QUEUES.poll).upsertJobScheduler(
  'poll-tick',
  { every: 10_000 },
  { name: 'poll-tick', opts: { removeOnComplete: true, removeOnFail: { count: 50 } } },
);
// Hourly: the rollups only feed the 30-day chart (6-hour buckets).
await queue(QUEUES.maintenance).upsertJobScheduler(
  'history-maintenance',
  { every: 60 * 60 * 1000 },
  { name: 'history-maintenance' },
);
await queue(QUEUES.maintenance).upsertJobScheduler(
  'maintenance-hourly',
  { every: 60 * 60 * 1000 },
  { name: 'maintenance-hourly' },
);

// Event reminders, an hour before each occurrence (each goes out once, however often this runs).
await queue(QUEUES.notify).upsertJobScheduler(
  'event-reminders',
  { every: 5 * 60 * 1000 },
  { name: 'event-reminders' },
);

// Smaller copies of images uploaded before they were made (quick once there are none left).
await queue(QUEUES.media).add(
  'media-variants',
  {},
  { jobId: 'media-variants', removeOnComplete: true, removeOnFail: true },
);

// Health endpoint for container orchestration and the e2e test harness.
const health = createServer((req, res) => {
  const ok = workers.every((w) => w.isRunning());
  res.writeHead(req.url === '/health' ? (ok ? 200 : 503) : 404, {
    'content-type': 'application/json',
  });
  res.end(JSON.stringify({ status: ok ? 'ok' : 'degraded', workers: workers.length }));
});
health.listen(env().WORKER_HEALTH_PORT);

log.info({ healthPort: env().WORKER_HEALTH_PORT }, 'worker started');

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  health.close();
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeRedis();
  await sql.end({ timeout: 5 });
  await flushTelemetry();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
