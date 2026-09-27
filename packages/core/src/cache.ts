import { logger } from './logger';
import { cacheRedis } from './redis';

const log = logger('cache');

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
  try {
    const hit = await cacheRedis().get(k);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    log.warn({ err: (err as Error).message, key }, 'cache read failed');
  }
  const value = await load();
  cacheRedis()
    .set(k, JSON.stringify(value), 'EX', ttlSeconds)
    .catch((err: Error) => log.warn({ err: err.message, key }, 'cache write failed'));
  return value;
}
