import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '@magnox/auth';
// Just the modules needed here: the package's main entry also loads image processing, S3,
// Stripe and the rest, which this process never uses.
import { communityForDomain } from '@magnox/core/domain-lookup';
import { noteServerViewer } from '@magnox/core/servers/hot';
import { env } from '@magnox/core/env';
import { logger } from '@magnox/core/logger';
import { cacheRedis } from '@magnox/core/redis';
import { rooms } from '@magnox/core/rooms';
import { flushTelemetry, initTelemetry } from '@magnox/core/telemetry';
import { authorizeRoom } from './authorize';
import { registerPresence } from './presence';

const log = logger('realtime');
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
  maxHttpBufferSize: 64 * 1024,
});
io.adapter(createAdapter(pub, sub));

export interface SocketData {
  userId: string | null;
  name: string;
  subscriptions: Set<string>;
  lastTyping: number;
}

io.use(async (socket, next) => {
  const origin = socket.handshake.headers.origin;
  if (origin && origin !== appOrigin) {
    // A community's own domain: visitors there aren't signed in (sessions live on the main site),
    // so they connect as guests.
    const host = URL.canParse(origin) ? new URL(origin).host : '';
    if (!(await communityForDomain(host).catch(() => null))) {
      log.warn({ origin }, 'rejected socket from foreign origin');
      return next(new Error('forbidden'));
    }
    socket.data.userId = null;
    socket.data.name = '';
    socket.data.subscriptions = new Set<string>();
    socket.data.lastTyping = 0;
    return next();
  }
  try {
    const session = await auth().api.getSession({
      headers: fromNodeHeaders(socket.handshake.headers),
    });
    socket.data.userId = session?.user.id ?? null;
    socket.data.name = session?.user.name ?? '';
  } catch (err) {
    log.error({ err }, 'session lookup failed');
    socket.data.userId = null;
  }
  socket.data.subscriptions = new Set<string>();
  socket.data.lastTyping = 0;
  next();
});

const MAX_SUBSCRIPTIONS = 200;
const ROOM_RE = /^(community|channel|chat|thread|server):[0-9a-f-]{36}$/;

io.on('connection', (socket: Socket) => {
  const data = socket.data as SocketData;
  log.debug({ socket: socket.id, user: data.userId }, 'connected');
  socket.on('disconnect', (reason) => log.debug({ socket: socket.id, reason }, 'disconnected'));
  if (data.userId) void socket.join(rooms.user(data.userId));

  socket.on('subscribe', async (room: unknown, ack?: (res: { ok: boolean }) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (typeof room !== 'string' || !ROOM_RE.test(room)) return reply({ ok: false });
    if (data.subscriptions.size >= MAX_SUBSCRIPTIONS) return reply({ ok: false });
    const ok = await authorizeRoom(data.userId, room).catch((err) => {
      log.error({ err, room }, 'authorize failed');
      return false;
    });
    if (!ok) return reply({ ok: false });
    await socket.join(room);
    data.subscriptions.add(room);
    log.debug({ socket: socket.id, room }, 'subscribed');
    reply({ ok: true });
  });

  socket.on('unsubscribe', async (room: unknown) => {
    if (typeof room !== 'string') return;
    await socket.leave(room);
    data.subscriptions.delete(room);
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

const port = env().REALTIME_PORT;
// Servers someone is still watching stay on the fast polling tier (subscribing marks them once;
// this keeps long-open pages counted).
setInterval(() => {
  for (const room of io.of('/').adapter.rooms.keys()) {
    if (room.startsWith('server:')) noteServerViewer(room.slice('server:'.length));
  }
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
