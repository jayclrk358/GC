import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '@magnox/auth';
// Just the modules needed here: the package's main entry also loads image processing, S3,
// Stripe and the rest, which this process never uses.
import { revokedRooms } from '@magnox/core/access';
import { communityForDomain } from '@magnox/core/domain-lookup';
import { noteServerViewer } from '@magnox/core/servers/hot';
import { env } from '@magnox/core/env';
import { logger } from '@magnox/core/logger';
import { cacheRedis, sessionsRevoked } from '@magnox/core/redis';
import { rooms } from '@magnox/core/rooms';
import { flushTelemetry, initTelemetry } from '@magnox/core/telemetry';
import { authorizeRoom, noteAccessChanged } from './authorize';
import { addressKey, clientIp, ConnectionCounts, EventLimiter, HotAllowance } from './limits';
import { registerPresence } from './presence';

const log = logger('realtime');
// A stray rejected promise (a Redis blip mid-handler, a publish nobody waited on) is logged and
// the server carries on; Node would otherwise exit, dropping every connection. An exception
// nothing caught leaves the process in an unknown state, so log it and exit for the container to
// restart.
process.on('unhandledRejection', (reason) => log.error({ err: reason }, 'unhandled rejection'));
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'uncaught exception');
  void flushTelemetry().finally(() => process.exit(1));
});
await initTelemetry('realtime');
const appOrigin = new URL(env().APP_URL).origin;

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: io.engine.clientsCount }));
    return;
  }
  res.writeHead(404).end();
});

const pub = cacheRedis().duplicate();
const sub = cacheRedis().duplicate();

const io = new Server(httpServer, {
  serveClient: false,
  cors: { origin: appOrigin, credentials: true },
  pingInterval: 20_000,
  pingTimeout: 20_000,
  // The largest real message is presence:watch with 200 ids, about 7 KB.
  maxHttpBufferSize: 16 * 1024,
});
io.adapter(createAdapter(pub, sub));

export interface SocketData {
  userId: string | null;
  name: string;
  /** Rooms joined with `subscribe`, each with the community it belongs to (null: none). */
  subscriptions: Map<string, string | null>;
  lastTyping: number;
  limiter: EventLimiter;
  hot: HotAllowance;
}

// Connection caps (per realtime node). Signed-out connections cost nothing to open, so one
// address gets few of them; signed-in ones are capped per account instead, with a looser cap per
// address so that a school or office behind one address still works.
const MAX_GUESTS_PER_ADDRESS = 30;
const MAX_PER_USER = 20;
const MAX_PER_ADDRESS = 200;
const connections = new ConnectionCounts();

/** Who's connecting: someone signed in, a guest, or (null) a page on a site that isn't ours. */
async function identify(socket: Socket): Promise<{ userId: string | null; name: string } | null> {
  const origin = socket.handshake.headers.origin;
  if (origin && origin !== appOrigin) {
    // A community's own domain: visitors there aren't signed in (sessions live on the main site),
    // so they connect as guests.
    const host = URL.canParse(origin) ? new URL(origin).host : '';
    if (!(await communityForDomain(host).catch(() => null))) {
      log.warn({ origin }, 'rejected socket from foreign origin');
      return null;
    }
    return { userId: null, name: '' };
  }
  try {
    const headers = fromNodeHeaders(socket.handshake.headers);
    let session = await auth().api.getSession({ headers });
    // Signed out by an admin (e.g. banned): don't trust the cookie's cached copy of the session.
    if (session && (await sessionsRevoked(session.user.id))) {
      session = await auth().api.getSession({ headers, query: { disableCookieCache: true } });
    }
    return { userId: session?.user.id ?? null, name: session?.user.name ?? '' };
  } catch (err) {
    log.error({ err }, 'session lookup failed');
    return { userId: null, name: '' };
  }
}

/** Give a connection's slots back once it closes (or at once, if it already has). */
function releaseOnClose(socket: Socket, keys: string[]) {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    for (const key of keys) connections.release(key);
  };
  if (socket.conn.readyState === 'closed') return release();
  socket.conn.once('close', release);
  socket.once('disconnect', release);
}

io.use(async (socket, next) => {
  const held: string[] = [];
  const refuse = (reason: string) => {
    for (const key of held) connections.release(key);
    next(new Error(reason));
  };
  const hold = (key: string, max: number) => {
    if (!connections.acquire(key, max)) return false;
    held.push(key);
    return true;
  };
  try {
    const ip = clientIp(socket.handshake.address, socket.handshake.headers['x-forwarded-for']);
    const address = addressKey(ip);
    // Counted before the session lookup, so a burst of connections can't all slip past the cap.
    if (!hold(`ip:${address}`, MAX_PER_ADDRESS)) {
      log.warn({ ip }, 'too many connections from one address');
      return refuse('too many connections');
    }
    const who = await identify(socket);
    if (!who) return refuse('forbidden');
    const ok = who.userId
      ? hold(`user:${who.userId}`, MAX_PER_USER)
      : hold(`guest:${address}`, MAX_GUESTS_PER_ADDRESS);
    if (!ok) {
      log.warn({ ip, userId: who.userId }, 'too many connections');
      return refuse('too many connections');
    }
    const data: SocketData = {
      ...who,
      subscriptions: new Map(),
      lastTyping: 0,
      limiter: new EventLimiter(),
      hot: new HotAllowance(),
    };
    Object.assign(socket.data, data);
    releaseOnClose(socket, held);
    next();
  } catch (err) {
    log.error({ err }, 'connection setup failed');
    refuse('server error');
  }
});

const MAX_SUBSCRIPTIONS = 200;
const ROOM_RE =
  /^(community|channel|chat|thread|server):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

io.on('connection', (socket: Socket) => {
  const data = socket.data as SocketData;
  log.debug({ socket: socket.id, user: data.userId }, 'connected');
  socket.on('disconnect', (reason) => log.debug({ socket: socket.id, reason }, 'disconnected'));
  if (data.userId) void socket.join(rooms.user(data.userId));

  // Every event spends from the socket's allowance. Over it, events are dropped; a socket that
  // keeps going is disconnected.
  socket.use(([event], next) => {
    const verdict = data.limiter.check(String(event));
    if (verdict === 'ok') return next();
    if (verdict === 'disconnect' && socket.connected) {
      log.warn({ socket: socket.id, user: data.userId, event }, 'socket over its rate limit');
      socket.disconnect(true);
    }
  });

  socket.on('subscribe', async (room: unknown, ack?: (res: { ok: boolean }) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (typeof room !== 'string' || !ROOM_RE.test(room)) return reply({ ok: false });
    if (data.subscriptions.size >= MAX_SUBSCRIPTIONS) return reply({ ok: false });
    try {
      const grant = await authorizeRoom(data.userId, room);
      if (!grant || !socket.connected) return reply({ ok: false });
      await socket.join(room);
      data.subscriptions.set(room, grant.communityId);
      // Live viewers keep a server on the fast polling tier, within the socket's allowance.
      const endpointId = room.startsWith('server:') ? room.slice('server:'.length) : null;
      if (endpointId && data.hot.allow(endpointId)) noteServerViewer(endpointId);
      log.debug({ socket: socket.id, room }, 'subscribed');
      reply({ ok: true });
    } catch (err) {
      log.error({ err, room }, 'subscribe failed');
      reply({ ok: false });
    }
  });

  socket.on('unsubscribe', async (room: unknown) => {
    if (typeof room !== 'string' || !data.subscriptions.has(room)) return;
    data.subscriptions.delete(room);
    if (room.startsWith('server:')) data.hot.endpoints.delete(room.slice('server:'.length));
    try {
      await socket.leave(room);
    } catch (err) {
      log.warn({ err, room }, 'unsubscribe failed');
    }
  });

  // Typing indicators are ephemeral: relayed to people with the channel open, never stored. Only
  // people subscribed to (so allowed to view) the channel can send or receive them.
  socket.on('typing', (channelId: unknown) => {
    if (!data.userId || typeof channelId !== 'string') return;
    const room = rooms.chat(channelId);
    if (!data.subscriptions.has(room)) return;
    const now = Date.now();
    if (now - data.lastTyping < 2000) return;
    data.lastTyping = now;
    socket.to(room).emit('typing', { channelId, userId: data.userId, name: data.name });
  });

  registerPresence(io, socket);
});

/**
 * Rooms are only checked when joined. When someone's access in a community may have shrunk
 * (`accessChanged`, sent from any process to every node), the rooms this node's sockets joined
 * there are checked again (only that person's, with a user id). Those no longer allowed are left,
 * and the page is told (`room:revoked`) so it doesn't join them again on reconnect.
 */
io.on('access:changed', (payload: unknown) => {
  const { communityId, userId } = (payload ?? {}) as { communityId?: unknown; userId?: unknown };
  if (typeof communityId !== 'string' || (userId !== null && typeof userId !== 'string')) return;
  noteAccessChanged(communityId, userId);
  revokeRooms(communityId, userId).catch((err) =>
    log.error({ err, communityId, userId }, 'access re-check failed'),
  );
});

async function revokeRooms(communityId: string, userId: string | null) {
  const nsp = io.of('/');
  const ids = userId ? [...(nsp.adapter.rooms.get(rooms.user(userId)) ?? [])] : nsp.sockets.keys();
  const affected: { socket: Socket; rooms: string[] }[] = [];
  for (const id of ids) {
    const socket = nsp.sockets.get(id);
    if (!socket) continue;
    const joined = [...(socket.data as SocketData).subscriptions]
      .filter(([, community]) => community === communityId)
      .map(([room]) => room);
    if (joined.length) affected.push({ socket, rooms: joined });
  }
  if (!affected.length) return;
  const revoked = await revokedRooms(
    communityId,
    affected.map(({ socket, rooms }) => ({ userId: (socket.data as SocketData).userId, rooms })),
  );
  affected.forEach(({ socket }, i) => {
    for (const room of revoked[i] ?? []) {
      (socket.data as SocketData).subscriptions.delete(room);
      void socket.leave(room);
      socket.emit('room:revoked', { room });
    }
  });
  log.debug({ communityId, userId, sockets: affected.length }, 'access re-checked');
}

const port = env().REALTIME_PORT;
// Servers someone is still watching stay on the fast polling tier (subscribing marks them once;
// this keeps long-open pages counted). Only those each socket was allowed to mark.
setInterval(() => {
  const watched = new Set<string>();
  for (const socket of io.of('/').sockets.values()) {
    for (const id of (socket.data as SocketData).hot.endpoints) watched.add(id);
  }
  for (const id of watched) noteServerViewer(id);
}, 4 * 60_000).unref();

httpServer.listen(port, () => log.info({ port }, 'realtime listening'));

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  // Tell clients to reconnect elsewhere, then drain.
  io.emit('server:restarting');
  io.close();
  await Promise.allSettled([pub.quit(), sub.quit()]);
  await flushTelemetry();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
