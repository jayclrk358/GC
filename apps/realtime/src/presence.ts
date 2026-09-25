import type { Server, Socket } from 'socket.io';
import { cacheRedis } from '@magnox/core';

const PRESENCE_TTL = 90;

/**
 * Lightweight presence: every connected user refreshes a key in Redis. Counts per community
 * are derived from membership when needed (see core presence helpers).
 */
export function registerPresence(_io: Server, socket: Socket) {
  const userId = socket.data.userId as string | null;
  if (!userId) return;
  const redis = cacheRedis();
  const key = `presence:${userId}`;
  const touch = () => void redis.set(key, '1', 'EX', PRESENCE_TTL);
  touch();
  const interval = setInterval(touch, (PRESENCE_TTL / 3) * 1000);
  socket.on('disconnect', async () => {
    clearInterval(interval);
    const sockets = await _io.in(`user:${userId}`).fetchSockets();
    if (sockets.length === 0) await redis.del(key);
  });
}
