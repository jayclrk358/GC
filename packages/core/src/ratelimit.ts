import { env } from './env';
import { AppError } from './errors';
import { cacheRedis } from './redis';

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetIn: number;
}

/** Fixed-window counter in Redis. Cheap and good enough for abuse protection. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (env().DISABLE_RATE_LIMITS) return { ok: true, remaining: limit, resetIn: 0 };
  const redis = cacheRedis();
  const k = `rl:${key}`;
  // One round trip: count, start the window if this is its first hit, and read what's left.
  const [[, count], , [, ttl]] = (await redis
    .multi()
    .incr(k)
    .expire(k, windowSeconds, 'NX')
    .ttl(k)
    .exec()) as [[null, number], [null, number], [null, number]];
  const resetIn = ttl < 0 ? windowSeconds : ttl;
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetIn };
}

/** Throw a user-facing error when the limit is exceeded. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message = "You're doing that too often. Please wait a moment.",
): Promise<void> {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.ok) throw new AppError('rate_limited', message, { retryAfter: r.resetIn });
}
