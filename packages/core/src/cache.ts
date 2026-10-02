import { logger } from './logger';
import { cacheRedis } from './redis';

const log = logger('cache');

/** Hot keys are also kept in this process for a few seconds, saving a Redis round trip each. */
const LOCAL_MS = 5_000;
const LOCAL_MAX = 5_000;
// Next.js can load this module more than once in one process (once per server layer: pages,
// route handlers, server actions), so the maps live on globalThis and every copy shares them;
// otherwise dropping a value in one copy would leave it in the others.
const shared = globalThis as typeof globalThis & {
  __magnoxCache?: {
    // Stored as JSON so each caller gets its own copy (some sort or extend what they get back).
    local: Map<string, { json: string; until: number }>;
    /** Loads in progress: concurrent misses on one key wait for the same load. */
    inflight: Map<string, Promise<string>>;
  };
};
const { local, inflight } = (shared.__magnoxCache ??= { local: new Map(), inflight: new Map() });

/**
 * Read-through cache for small results that are the same for everyone (platform counts, the game
 * catalogue), so busy pages don't repeat the same queries. If Redis is unavailable the value is
 * simply computed.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const k = `cache:${key}`;
  const hit = local.get(k);
  if (hit && hit.until > Date.now()) return JSON.parse(hit.json) as T;

  let running = inflight.get(k);
  if (!running) {
    running = (async () => {
      let json: string | null = null;
      try {
        json = await cacheRedis().get(k);
      } catch (err) {
        log.warn({ err: (err as Error).message, key }, 'cache read failed');
      }
      if (json === null) {
        json = JSON.stringify(await load()) ?? 'null';
        cacheRedis()
          .set(k, json, 'EX', ttlSeconds)
          .catch((err: Error) => log.warn({ err: err.message, key }, 'cache write failed'));
      }
      if (local.size >= LOCAL_MAX) local.delete(local.keys().next().value!);
      local.set(k, { json, until: Date.now() + Math.min(LOCAL_MS, ttlSeconds * 1000) });
      return json;
    })();
    inflight.set(k, running);
    running.then(
      () => inflight.delete(k),
      () => inflight.delete(k),
    );
  }
  return JSON.parse(await running) as T;
}

/** Drop a cached value (here and in Redis), e.g. after the data behind it changed. */
export async function uncache(key: string): Promise<void> {
  local.delete(`cache:${key}`);
  await cacheRedis()
    .del(`cache:${key}`)
    .catch((err: Error) => log.warn({ err: err.message, key }, 'cache delete failed'));
}
