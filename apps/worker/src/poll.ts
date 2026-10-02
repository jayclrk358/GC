import { GameDig, type QueryResult } from 'gamedig';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema, sql } from '@magnox/db';
import {
  BlockedAddressError,
  cacheRedis,
  cleanServerText,
  env,
  declareDown,
  declareUp,
  POLL,
  postServerAlerts,
  recordSample,
  endpointStatus,
  logger,
  networkKey,
  nextPollDelay,
  pinnedGet,
  QUEUES,
  queue,
  rateLimit,
  realtime,
  resolveTarget,
  type ResolvedTarget,
  rooms,
  shouldGoDormant,
  UnresolvableHostError,
} from '@magnox/core';
import {
  isLinkProtocol,
  isServerProtocol,
  SERVER_PROTOCOLS,
  type ServerProtocol,
} from '@magnox/shared';

const log = logger('poll');

/** Claim endpoints that are due and enqueue one poll job each (deduplicated per minute). */
export async function pollTick(): Promise<number> {
  const due = await sql<{ id: string }[]>`
    WITH due AS (
      SELECT id FROM server_endpoints
      WHERE next_poll_at <= now() AND dormant = false
      ORDER BY next_poll_at
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE server_endpoints e
    SET next_poll_at = now() + interval '2 minutes'
    FROM due WHERE e.id = due.id
    RETURNING e.id`;
  if (!due.length) return 0;
  const bucket = Math.floor(Date.now() / 30_000);
  await queue(QUEUES.poll).addBulk(
    due.map((r) => ({
      name: 'poll-endpoint',
      data: { endpointId: r.id },
      opts: {
        jobId: `poll-${r.id}-${bucket}`,
        attempts: 1,
        // Thousands an hour: nothing to look back at once done.
        removeOnComplete: true,
        removeOnFail: { count: 200 },
      },
    })),
  );
  return due.length;
}

interface QueryOutcome {
  ok: boolean;
  result?: QueryResult;
  error?: 'blocked' | 'dns' | 'timeout' | 'rate_limited';
  ip?: string;
}

async function query(protocol: ServerProtocol, host: string, port: number): Promise<QueryOutcome> {
  let target;
  try {
    target = await resolveTarget(host, port, {
      srvService: protocol === 'minecraft' ? '_minecraft._tcp' : undefined,
    });
  } catch (e) {
    if (e instanceof BlockedAddressError) return { ok: false, error: 'blocked' };
    if (e instanceof UnresolvableHostError) return { ok: false, error: 'dns' };
    throw e;
  }
  // Per-destination token buckets so the poller can never be used to flood a host or network.
  const [perIp, perNet] = await Promise.all([
    rateLimit(`poll-ip:${target.ip}`, 12, 60),
    rateLimit(`poll-net:${networkKey(target.ip)}`, 120, 60),
  ]);
  if (!perIp.ok || !perNet.ok) return { ok: false, error: 'rate_limited', ip: target.ip };

  try {
    const viaHttp = HTTP_QUERIES[protocol];
    if (viaHttp) return { ok: true, result: await viaHttp(target), ip: target.ip };
    const result = await GameDig.query({
      type: SERVER_PROTOCOLS[protocol].gamedig,
      host: target.ip,
      port: target.port,
      givenPortOnly: true,
      portCache: false,
      maxRetries: 1,
      socketTimeout: 3000,
      attemptTimeout: 6000,
      requestRules: false,
      stripColors: true,
    });
    return { ok: true, result, ip: target.ip };
  } catch {
    // Never surface raw errors: they would turn the poller into a port scanner.
    return { ok: false, error: 'timeout', ip: target.ip };
  }
}

// FiveM and TShock answer over HTTP. GameDig asks them with `got`, which follows redirects to any
// host, so a server could send the worker to internal addresses (cloud metadata, other
// containers) and have the answer shown on its listing. They're asked here instead: at the
// vetted address only, with no redirects, and nothing but the status fields kept.

const HTTP_QUERIES: Partial<
  Record<ServerProtocol, (target: ResolvedTarget) => Promise<QueryResult>>
> = { fivem: queryFiveM, terraria: queryTShock };

/** A JSON document from the server's own HTTP port, and how long it took. */
async function serverJson(
  target: ResolvedTarget,
  path: string,
  maxBytes = 256 * 1024,
): Promise<{ json: Record<string, unknown>; ms: number }> {
  const start = performance.now();
  const res = await pinnedGet(target, path, {
    accept: 'application/json',
    maxBytes,
    timeoutMs: 3000,
  });
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const json: unknown = JSON.parse(res.body.toString('utf8'));
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('not an object');
  return { json: json as Record<string, unknown>, ms: performance.now() - start };
}

const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const count = (v: unknown) =>
  typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,9}$/.test(v.trim()) ? Number(v) : NaN;

function httpResult(r: {
  name: string;
  map?: string;
  version?: string;
  players: number;
  maxPlayers: number;
  ms: number;
}): QueryResult {
  return {
    name: r.name.trim(),
    map: r.map ?? '',
    password: false,
    numplayers: r.players,
    maxplayers: r.maxPlayers,
    players: [],
    bots: [],
    connect: '',
    ping: r.ms,
    version: r.version ?? '',
    queryPort: 0,
    raw: {},
  } as unknown as QueryResult;
}

/** FiveM: name, map and player counts from /dynamic.json; its build from /info.json if offered. */
async function queryFiveM(target: ResolvedTarget): Promise<QueryResult> {
  const { json, ms } = await serverJson(target, '/dynamic.json');
  // info.json lists every resource (and the icon), so it can be large; it's optional.
  const info = await serverJson(target, '/info.json', 1_000_000).catch(() => null);
  return httpResult({
    name: text(json.hostname),
    map: text(json.mapname),
    version: text(info?.json.version ?? json.iv),
    players: count(json.clients),
    maxPlayers: count(json.sv_maxclients),
    ms,
  });
}

/** Terraria with TShock: its REST API's status endpoint (needs no token). */
async function queryTShock(target: ResolvedTarget): Promise<QueryResult> {
  const { json, ms } = await serverJson(target, '/v2/server/status?players=true');
  if (String(json.status) !== '200') throw new Error('Invalid status');
  return httpResult({
    name: text(json.name),
    players: count(json.playercount),
    maxPlayers: count(json.maxplayers),
    ms,
  });
}

/** Roblox's public APIs, or the test stand-in. */
function robloxUrl(kind: 'universe' | 'games', id: string): string {
  const base = env().ROBLOX_API_URL;
  return kind === 'universe'
    ? `${base || 'https://apis.roblox.com'}/universes/v1/places/${id}/universe`
    : `${base || 'https://games.roblox.com'}/v1/games?universeIds=${id}`;
}

async function robloxJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: { accept: 'application/json' },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`roblox ${res.status}`);
  return (await res.json()) as T;
}

interface RobloxGame {
  id?: number;
  name?: string;
  description?: string | null;
  playing?: number;
}

/** Roblox's games API takes up to 50 experiences a request. */
const ROBLOX_BATCH = 50;
/** How long a lookup waits for others to share its request (polls are enqueued together). */
const ROBLOX_BATCH_MS = 250;
type GameWaiter = {
  resolve: (g: RobloxGame | null | 'rate_limited') => void;
  reject: (e: unknown) => void;
};
const robloxWaiting = new Map<string, GameWaiter[]>();
let robloxTimer: NodeJS.Timeout | null = null;

/** One experience's details, fetched alongside any others asked for at about the same time. */
function robloxGame(universeId: string): Promise<RobloxGame | null | 'rate_limited'> {
  return new Promise((resolve, reject) => {
    const list = robloxWaiting.get(universeId) ?? [];
    list.push({ resolve, reject });
    robloxWaiting.set(universeId, list);
    if (robloxWaiting.size >= ROBLOX_BATCH) void flushRoblox();
    else robloxTimer ??= setTimeout(() => void flushRoblox(), ROBLOX_BATCH_MS);
  });
}

async function flushRoblox(): Promise<void> {
  if (robloxTimer) clearTimeout(robloxTimer);
  robloxTimer = null;
  const batch = new Map(robloxWaiting);
  robloxWaiting.clear();
  if (!batch.size) return;
  const settle = (id: string, fn: (w: GameWaiter) => void) => batch.get(id)?.forEach(fn);
  try {
    // Shared budget so a burst of listings can't hammer Roblox's API.
    if (!(await rateLimit('poll-roblox', 120, 60)).ok) {
      for (const id of batch.keys()) settle(id, (w) => w.resolve('rate_limited'));
      return;
    }
    const games = await robloxJson<{ data?: RobloxGame[] }>(
      robloxUrl('games', [...batch.keys()].join(',')),
    );
    const byId = new Map((games?.data ?? []).map((g) => [String(g.id), g]));
    for (const id of batch.keys()) settle(id, (w) => w.resolve(byId.get(id) ?? null));
  } catch (e) {
    for (const id of batch.keys()) settle(id, (w) => w.reject(e));
  }
}

/**
 * A Roblox experience: name, description and how many people are playing right now, from
 * Roblox's public games API. The description carries the ownership code, like a MOTD.
 */
async function queryRoblox(placeId: string): Promise<QueryOutcome> {
  try {
    const key = `roblox-universe:${placeId}`;
    let universeId = await cacheRedis().get(key);
    if (!universeId) {
      if (!(await rateLimit('poll-roblox', 120, 60)).ok)
        return { ok: false, error: 'rate_limited' };
      const u = await robloxJson<{ universeId: number | null }>(robloxUrl('universe', placeId));
      if (!u?.universeId) return { ok: false, error: 'dns' };
      universeId = String(u.universeId);
      await cacheRedis().set(key, universeId, 'EX', 86_400);
    }
    const game = await robloxGame(universeId);
    if (game === 'rate_limited') return { ok: false, error: 'rate_limited' };
    if (!game) return { ok: false, error: 'dns' };
    const result = {
      name: game.name ?? '',
      map: '',
      password: false,
      // Roblox runs many servers per experience; "max players" is per server, so it isn't shown.
      numplayers: Number.isFinite(game.playing) ? game.playing! : 0,
      maxplayers: Number.NaN,
      players: [],
      bots: [],
      connect: '',
      ping: Number.NaN,
      version: '',
      queryPort: 0,
      raw: { description: game.description ?? '' },
    } as unknown as QueryResult;
    return { ok: true, result };
  } catch {
    return { ok: false, error: 'timeout' };
  }
}

function extractMotd(result: QueryResult): string {
  const raw = result.raw as Record<string, unknown> | undefined;
  const desc =
    raw?.vanilla && typeof raw.vanilla === 'object'
      ? (raw.vanilla as Record<string, unknown>).raw
      : undefined;
  return JSON.stringify([result.name, desc ?? null, raw?.description ?? null]).slice(0, 20_000);
}

export async function pollEndpoint(endpointId: string): Promise<void> {
  const endpoint = await db.query.serverEndpoints.findFirst({
    where: eq(schema.serverEndpoints.id, endpointId),
  });
  if (!endpoint) return;

  const listings = await db
    .select({
      id: schema.gameServers.id,
      listed: schema.gameServers.listed,
      verifiedAt: schema.gameServers.verifiedAt,
      verifyToken: schema.gameServers.verifyToken,
    })
    .from(schema.gameServers)
    .where(
      and(eq(schema.gameServers.endpointId, endpointId), isNull(schema.gameServers.deletedAt)),
    );

  if (listings.length === 0) {
    await db
      .update(schema.serverEndpoints)
      .set({ dormant: true })
      .where(eq(schema.serverEndpoints.id, endpointId));
    return;
  }

  const protocol: ServerProtocol = isServerProtocol(endpoint.protocol)
    ? endpoint.protocol
    : 'source';
  const outcome = isLinkProtocol(protocol)
    ? await queryRoblox(endpoint.host)
    : await query(protocol, endpoint.host, endpoint.port);
  const now = new Date();
  const hot = Boolean(endpoint.hotUntil && endpoint.hotUntil > now);
  // Listed and verified: shown in the server browser, so a little fresher than the rest.
  const important = listings.some((l) => l.listed && l.verifiedAt);

  if (outcome.error === 'rate_limited') {
    await db
      .update(schema.serverEndpoints)
      .set({ nextPollAt: new Date(now.getTime() + 60_000) })
      .where(eq(schema.serverEndpoints.id, endpointId));
    return;
  }

  let update: Partial<typeof schema.serverEndpoints.$inferInsert>;
  if (outcome.ok && outcome.result) {
    const r = outcome.result;
    const players = Number.isFinite(r.numplayers) ? r.numplayers : (r.players?.length ?? null);
    update = {
      online: true,
      players: players === null ? null : Math.max(0, Math.min(1_000_000, players)),
      maxPlayers: Number.isFinite(r.maxplayers)
        ? Math.max(0, Math.min(1_000_000, r.maxplayers))
        : null,
      map: cleanServerText(r.map, 80),
      version: cleanServerText(r.version, 60),
      reportedName: cleanServerText(r.name, 200),
      pingMs: Number.isFinite(r.ping) ? Math.round(r.ping) : null,
      resolvedIp: outcome.ip ?? endpoint.resolvedIp,
      lastCheckedAt: now,
      lastOnlineAt: now,
      failCount: 0,
      lastError: null,
      nextPollAt: new Date(
        now.getTime() +
          nextPollDelay({ ok: true, failCount: 0, hot, important }, Math.random() * 2 - 1),
      ),
    };

    // Ownership verification: the token must appear in the server name/MOTD.
    const motd = extractMotd(r);
    const toVerify = listings.filter((l) => !l.verifiedAt && motd.includes(l.verifyToken));
    for (const l of toVerify) {
      // Two polls can overlap (scheduled + manual); only the first one records verification.
      const updated = await db
        .update(schema.gameServers)
        .set({ verifiedAt: now })
        .where(and(eq(schema.gameServers.id, l.id), isNull(schema.gameServers.verifiedAt)))
        .returning({ id: schema.gameServers.id });
      if (updated.length) log.info({ serverId: l.id }, 'server verified');
    }
  } else {
    const failCount = endpoint.failCount + 1;
    const dormant = shouldGoDormant({
      lastOnlineAt: endpoint.lastOnlineAt,
      createdAt: endpoint.createdAt,
      now,
    });
    update = {
      online: false,
      players: null,
      pingMs: null,
      lastCheckedAt: now,
      failCount,
      lastError: outcome.error ?? 'timeout',
      dormant,
      nextPollAt: new Date(
        now.getTime() +
          nextPollDelay({ ok: false, failCount, hot, important }, Math.random() * 2 - 1),
      ),
    };
  }

  const [row] = await db
    .update(schema.serverEndpoints)
    .set(update)
    .where(eq(schema.serverEndpoints.id, endpointId))
    .returning();
  if (!row) return;
  // Only when something people see changed (not the ping or check time), so quiet servers send
  // nothing.
  const changed =
    !endpoint.lastCheckedAt ||
    endpoint.online !== row.online ||
    endpoint.players !== row.players ||
    endpoint.maxPlayers !== row.maxPlayers ||
    endpoint.map !== row.map ||
    endpoint.version !== row.version ||
    endpoint.reportedName !== row.reportedName;
  if (changed) {
    realtime()
      .to(rooms.server(endpointId))
      .emit('server:status', { endpointId, status: endpointStatus(row) });
    log.debug({ endpointId, online: row.online, players: row.players }, 'status published');
  }

  await recordSample({
    endpointId,
    ts: now,
    online: row.online,
    players: row.players,
    pingMs: row.pingMs,
  }).catch((err) => log.warn({ err: (err as Error).message, endpointId }, 'sample not recorded'));

  // Chat alerts: "down" only after repeated failures (one missed poll is noise), "back up" once
  // it answers again. declareDown/Up are conditional updates, so overlapping polls alert once.
  if (row.online && endpoint.downSince) {
    if (await declareUp(endpointId)) {
      const since = endpoint.lastOnlineAt ?? endpoint.downSince;
      await postServerAlerts(endpointId, 'server_up', {
        downtimeMs: now.getTime() - since.getTime(),
      });
    }
  } else if (!row.online && row.failCount >= POLL.alertAfterFailures && !endpoint.downSince) {
    if (await declareDown(endpointId, now)) await postServerAlerts(endpointId, 'server_down');
  }
}

/** Wake dormant endpoints that someone looked at recently. */
export async function wakeHotDormant(): Promise<void> {
  await db
    .update(schema.serverEndpoints)
    .set({ dormant: false, nextPollAt: new Date() })
    .where(
      and(
        eq(schema.serverEndpoints.dormant, true),
        gt(schema.serverEndpoints.hotUntil, new Date()),
      ),
    );
}
