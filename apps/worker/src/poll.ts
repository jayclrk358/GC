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
  QUEUES,
  queue,
  rateLimit,
  realtime,
  resolveTarget,
  rooms,
  shouldGoDormant,
  UnresolvableHostError,
} from '@magnox/core';
import { isLinkProtocol, SERVER_PROTOCOLS, type ServerProtocol } from '@magnox/shared';

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
      opts: { jobId: `poll-${r.id}-${bucket}`, attempts: 1 },
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

/**
 * A Roblox experience: name, description and how many people are playing right now, from
 * Roblox's public games API. The description carries the ownership code, like a MOTD.
 */
async function queryRoblox(placeId: string): Promise<QueryOutcome> {
  // Shared budget so a burst of listings can't hammer Roblox's API.
  if (!(await rateLimit('poll-roblox', 120, 60)).ok) return { ok: false, error: 'rate_limited' };
  try {
    const key = `roblox-universe:${placeId}`;
    let universeId = await cacheRedis().get(key);
    if (!universeId) {
      const u = await robloxJson<{ universeId: number | null }>(robloxUrl('universe', placeId));
      if (!u?.universeId) return { ok: false, error: 'dns' };
      universeId = String(u.universeId);
      await cacheRedis().set(key, universeId, 'EX', 86_400);
    }
    const games = await robloxJson<{
      data: { name?: string; description?: string | null; playing?: number }[];
    }>(robloxUrl('games', universeId));
    const game = games?.data?.[0];
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

  const protocol = (
    endpoint.protocol in SERVER_PROTOCOLS ? endpoint.protocol : 'source'
  ) as ServerProtocol;
  const outcome = isLinkProtocol(protocol)
    ? await queryRoblox(endpoint.host)
    : await query(protocol, endpoint.host, endpoint.port);
  const now = new Date();
  const hot = Boolean(endpoint.hotUntil && endpoint.hotUntil > now);
  const important = listings.some((l) => l.listed || l.verifiedAt);

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
  realtime()
    .to(rooms.server(endpointId))
    .emit('server:status', { endpointId, status: endpointStatus(row) });
  log.debug({ endpointId, online: row.online, players: row.players }, 'status published');

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
