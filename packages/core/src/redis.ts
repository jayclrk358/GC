import { Redis } from 'ioredis';
import { env } from './env';

const g = globalThis as unknown as { __mxQueueRedis?: Redis; __mxCacheRedis?: Redis };

/** Connection for BullMQ (must use maxmemory-policy noeviction in production). */
export function queueRedis(): Redis {
  g.__mxQueueRedis ??= new Redis(env().REDIS_QUEUE_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  return g.__mxQueueRedis;
}

/** Connection for caches, rate limits, presence and Socket.IO pub/sub. */
export function cacheRedis(): Redis {
  g.__mxCacheRedis ??= new Redis(env().REDIS_CACHE_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  return g.__mxCacheRedis;
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([g.__mxQueueRedis?.quit(), g.__mxCacheRedis?.quit()]);
  g.__mxQueueRedis = undefined;
  g.__mxCacheRedis = undefined;
}
