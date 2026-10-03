// Starts the web server once per CPU core, all sharing one port. Node runs JavaScript on a single
// core, so one server process can't use the rest of the machine: under load it maxes out one core
// while the others sit idle, and every page waits its turn.
//
// WEB_WORKERS sets how many. Left empty, it's one per core, but no more than the memory allows
// (about 1 GB each, leaving room for the database) and at most 4. 1 runs a single server, as
// before. In the Docker image this replaces `node apps/web/server.js`; it sits next to it.
import cluster from 'node:cluster';
import os from 'node:os';

function workerCount() {
  const set = Number.parseInt(process.env.WEB_WORKERS ?? '', 10);
  if (set > 0) return set;
  const byMemory = Math.floor(os.totalmem() / 2 ** 30) - 1;
  return Math.max(1, Math.min(os.availableParallelism(), byMemory, 4));
}

const count = cluster.isPrimary ? workerCount() : 1;

if (!cluster.isPrimary || count === 1) {
  await import('./server.js');
} else {
  // The database allows only so many connections. Unless told otherwise, the copies share about
  // as many as one server used to hold (10) plus some, rather than each opening a full pool.
  const poolSize = process.env.DATABASE_POOL_SIZE ?? String(Math.max(4, Math.ceil(20 / count)));
  let stopping = false;
  const start = () => cluster.fork({ DATABASE_POOL_SIZE: poolSize });
  for (let i = 0; i < count; i++) start();
  console.log(`web: ${count} server processes on one port (WEB_WORKERS to change)`);

  // One that crashes is replaced, after a pause so a crash loop doesn't spin.
  cluster.on('exit', (worker, code, signal) => {
    if (stopping) {
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0);
      return;
    }
    console.error(
      `web: server process ${worker.process.pid} exited (${signal ?? code}), restarting`,
    );
    setTimeout(start, 1000);
  });

  // `docker stop` signals this process only: pass it on and wait for them to finish.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      stopping = true;
      for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(signal);
      setTimeout(() => process.exit(0), 25_000).unref();
    });
  }
}
