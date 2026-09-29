import type { Server, Socket } from 'socket.io';
import { cacheRedis } from '@magnox/core/redis';

const PRESENCE_TTL = 90;
/** How many people one page can watch at once. */
const MAX_WATCHING = 500;
const USER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

type Status = 'online' | 'idle' | 'offline';

const keyOf = (userId: string) => `presence:${userId}`;
const roomOf = (userId: string) => `presence:${userId}`;

/** Stored values: "active" or "idle" (older deployments wrote "1", meaning online). */
function toStatus(value: string | null | undefined): Status {
  if (!value) return 'offline';
  return value === 'idle' ? 'idle' : 'online';
}

/**
 * Presence: each signed-in tab reports whether it's in use ("active") or left alone ("idle").
 * A person is online if any of their tabs is active, idle if all are idle, and offline with no
 * tabs open. The result lives in Redis (for counts elsewhere) and is pushed to everyone watching
 * that person, i.e. pages showing their avatar.
 */
export function registerPresence(io: Server, socket: Socket) {
  const redis = cacheRedis();
  const watching = new Set<string>();

  // Anyone (signed in or not) can follow the people whose avatars are on their screen.
  socket.on('presence:watch', async (ids: unknown, ack?: (res: Record<string, Status>) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!Array.isArray(ids)) return reply({});
    const valid = [
      ...new Set(ids.filter((x): x is string => typeof x === 'string' && USER_ID_RE.test(x))),
    ].slice(0, 200);
    for (const id of valid) {
      if (watching.has(id) || watching.size >= MAX_WATCHING) continue;
      watching.add(id);
      void socket.join(roomOf(id));
    }
    const values = valid.length ? await redis.mget(...valid.map(keyOf)) : [];
    reply(Object.fromEntries(valid.map((id, i) => [id, toStatus(values[i])])));
  });

  socket.on('presence:unwatch', (ids: unknown) => {
    if (!Array.isArray(ids)) return;
    for (const id of ids) {
      if (typeof id !== 'string' || !watching.has(id)) continue;
      watching.delete(id);
      void socket.leave(roomOf(id));
    }
  });

  const userId = socket.data.userId as string | null;
  if (!userId) return;
  socket.data.presence = 'active';
  const key = keyOf(userId);

  /** Recompute this person's status from all their tabs, store it, and tell watchers. */
  async function publish() {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    const next = !sockets.length
      ? null
      : sockets.some((s) => s.data.presence !== 'idle')
        ? 'active'
        : 'idle';
    const prev = await redis.get(key);
    if (next) await redis.set(key, next, 'EX', PRESENCE_TTL);
    else await redis.del(key);
    if (toStatus(prev) !== toStatus(next)) {
      io.to(roomOf(userId!)).emit('presence', { userId, status: toStatus(next) });
    }
  }

  void publish();
  // Keep the key alive; if it lapsed (say Redis restarted), work it out again.
  const interval = setInterval(
    () => {
      void redis.expire(key, PRESENCE_TTL).then((kept) => {
        if (!kept) void publish();
      });
    },
    (PRESENCE_TTL / 3) * 1000,
  );

  socket.on('presence:state', (state: unknown) => {
    if (state !== 'active' && state !== 'idle') return;
    if (socket.data.presence === state) return;
    socket.data.presence = state;
    void publish();
  });

  socket.on('disconnect', () => {
    clearInterval(interval);
    void publish();
  });
}
