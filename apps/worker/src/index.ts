import { createServer } from 'node:http';
import { Worker, type Job } from 'bullmq';
import { backfillHistory, closeRedis, env, logger, QUEUES, queue, queueRedis } from '@magnox/core';
import { sql } from '@magnox/db';
import { handlers } from './handlers';

const log = logger('worker');

const workers: Worker[] = [];

function start(name: string, concurrency: number) {
  const w = new Worker(
    name,
    async (job: Job) => {
      const handler = handlers[job.name];
      if (!handler) throw new Error(`No handler for job ${job.name}`);
      return handler(job);
    },
    { connection: queueRedis(), concurrency },
  );
  w.on('failed', (job, err) =>
    log.warn({ job: job?.name, id: job?.id, err: err.message }, 'job failed'),
  );
  w.on('error', (err) => log.error({ err }, 'worker error'));
  workers.push(w);
}

start(QUEUES.poll, 32);
start(QUEUES.maintenance, 1);
start(QUEUES.notify, 8);
start(QUEUES.previews, 4);
start(QUEUES.integrations, 4);

// Sample partitions must exist before the first poll lands; rollups catch up after downtime.
await backfillHistory().catch((err) => log.error({ err }, 'history backfill failed'));

// Recurring schedules. upsertJobScheduler is idempotent across restarts and replicas.
await queue(QUEUES.poll).upsertJobScheduler('poll-tick', { every: 5_000 }, { name: 'poll-tick' });
await queue(QUEUES.maintenance).upsertJobScheduler(
  'history-maintenance',
  { every: 10 * 60 * 1000 },
  { name: 'history-maintenance' },
);
await queue(QUEUES.maintenance).upsertJobScheduler(
  'maintenance-hourly',
  { every: 60 * 60 * 1000 },
  { name: 'maintenance-hourly' },
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
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
