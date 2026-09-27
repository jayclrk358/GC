import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  connectLink,
  displayAddress,
  newId,
  Permission,
  randomToken,
  serverInputSchema,
  SERVER_PROTOCOLS,
  type ServerProtocol,
  type ServerStatus,
} from '@magnox/shared';
import { requirePerm, type MemberContext } from '../access';
import { AppError, notFound } from '../errors';
import { BlockedAddressError, resolveTarget, UnresolvableHostError } from '../net/ssrf';
import { QUEUES, enqueue } from '../queues';
import { enforceRateLimit } from '../ratelimit';
import { POLL } from '../servers/schedule';
import { audit } from './audit';

const MAX_UNVERIFIED_PER_USER = 5;
const MAX_ENDPOINTS_PER_IP = 20;
const MAX_SERVERS_PER_COMMUNITY = 25;

export interface ServerView {
  id: string;
  endpointId: string;
  communityId: string | null;
  name: string;
  description: string;
  tags: string[];
  region: string;
  listed: boolean;
  protocol: ServerProtocol;
  protocolLabel: string;
  host: string;
  port: number;
  address: string;
  connectUrl: string | null;
  verified: boolean;
  verifyToken: string | null;
  voteCount: number;
  status: ServerStatus;
}

const selectView = {
  id: schema.gameServers.id,
  endpointId: schema.gameServers.endpointId,
  communityId: schema.gameServers.communityId,
  name: schema.gameServers.name,
  description: schema.gameServers.description,
  tags: schema.gameServers.tags,
  region: schema.gameServers.region,
  listed: schema.gameServers.listed,
  verifiedAt: schema.gameServers.verifiedAt,
  verifyToken: schema.gameServers.verifyToken,
  voteCount: schema.gameServers.voteCount,
  protocol: schema.serverEndpoints.protocol,
  host: schema.serverEndpoints.host,
  port: schema.serverEndpoints.port,
  online: schema.serverEndpoints.online,
  players: schema.serverEndpoints.players,
  maxPlayers: schema.serverEndpoints.maxPlayers,
  map: schema.serverEndpoints.map,
  version: schema.serverEndpoints.version,
  reportedName: schema.serverEndpoints.reportedName,
  pingMs: schema.serverEndpoints.pingMs,
  lastCheckedAt: schema.serverEndpoints.lastCheckedAt,
};

type ViewRow = { [K in keyof typeof selectView]: (typeof selectView)[K]['_']['data'] | null } & {
  id: string;
  endpointId: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  online: boolean;
};

export function endpointStatus(row: {
  online: boolean;
  players: number | null;
  maxPlayers: number | null;
  map: string | null;
  version: string | null;
  reportedName: string | null;
  pingMs: number | null;
  lastCheckedAt: Date | null;
}): ServerStatus {
  return {
    online: row.online,
    players: row.players,
    maxPlayers: row.maxPlayers,
    map: row.map,
    version: row.version,
    name: row.reportedName,
    pingMs: row.pingMs,
    checkedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
  };
}

function toView(r: ViewRow, opts: { showToken: boolean }): ServerView {
  const protocol = (r.protocol in SERVER_PROTOCOLS ? r.protocol : 'source') as ServerProtocol;
  return {
    id: r.id,
    endpointId: r.endpointId,
    communityId: r.communityId ?? null,
    name: r.name,
    description: r.description ?? '',
    tags: r.tags ?? [],
    region: r.region ?? 'global',
    listed: Boolean(r.listed),
    protocol,
    protocolLabel: SERVER_PROTOCOLS[protocol].label,
    host: r.host,
    port: r.port,
    address: displayAddress(protocol, r.host, r.port),
    connectUrl: connectLink(protocol, r.host, r.port),
    verified: Boolean(r.verifiedAt),
    verifyToken: opts.showToken && !r.verifiedAt ? (r.verifyToken ?? null) : null,
    voteCount: r.voteCount ?? 0,
    status: endpointStatus({
      online: r.online,
      players: r.players ?? null,
      maxPlayers: r.maxPlayers ?? null,
      map: r.map ?? null,
      version: r.version ?? null,
      reportedName: r.reportedName ?? null,
      pingMs: r.pingMs ?? null,
      lastCheckedAt: r.lastCheckedAt ?? null,
    }),
  };
}

async function queryViews(
  where: SQL,
  opts: { showToken: boolean; order?: SQL[]; limit?: number },
): Promise<ServerView[]> {
  const rows = await db
    .select(selectView)
    .from(schema.gameServers)
    .innerJoin(schema.serverEndpoints, eq(schema.serverEndpoints.id, schema.gameServers.endpointId))
    .where(and(where, isNull(schema.gameServers.deletedAt)))
    .orderBy(...(opts.order ?? [asc(schema.gameServers.createdAt)]))
    .limit(opts.limit ?? 100);
  return rows.map((r) => toView(r as ViewRow, opts));
}

export async function listCommunityServers(
  communityId: string,
  opts: { manage?: boolean } = {},
): Promise<ServerView[]> {
  return queryViews(eq(schema.gameServers.communityId, communityId), {
    showToken: Boolean(opts.manage),
  });
}

export async function getServersByIds(communityId: string, ids: string[]): Promise<ServerView[]> {
  if (!ids.length) return [];
  const views = await queryViews(
    and(eq(schema.gameServers.communityId, communityId), inArray(schema.gameServers.id, ids))!,
    { showToken: false },
  );
  const byId = new Map(views.map((v) => [v.id, v]));
  return ids.map((id) => byId.get(id)).filter((v): v is ServerView => Boolean(v));
}

export async function listPublicServers(
  opts: { q?: string; protocol?: string; limit?: number } = {},
) {
  const where: SQL[] = [
    eq(schema.gameServers.listed, true),
    isNotNull(schema.gameServers.verifiedAt),
  ];
  if (opts.protocol && opts.protocol in SERVER_PROTOCOLS)
    where.push(eq(schema.serverEndpoints.protocol, opts.protocol));
  const q = opts.q?.trim().slice(0, 100);
  if (q) {
    const pat = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    where.push(
      or(
        sql`${schema.gameServers.name} ILIKE ${pat}`,
        sql`${q} = ANY(${schema.gameServers.tags})`,
      )!,
    );
  }
  return queryViews(and(...where)!, {
    showToken: false,
    order: [
      desc(schema.serverEndpoints.online),
      sql`${schema.serverEndpoints.players} desc nulls last`,
      desc(schema.gameServers.voteCount),
    ],
    limit: opts.limit ?? 50,
  });
}

function mapResolveError(e: unknown): never {
  if (e instanceof BlockedAddressError || e instanceof UnresolvableHostError) {
    throw new AppError('validation', e.message, { fields: { host: e.message } });
  }
  throw e;
}

async function findOrCreateEndpoint(protocol: ServerProtocol, host: string, port: number) {
  const target = await resolveTarget(host, port, {
    srvService: protocol === 'minecraft' ? '_minecraft._tcp' : undefined,
  }).catch(mapResolveError);

  const existing = await db.query.serverEndpoints.findFirst({
    where: and(
      eq(schema.serverEndpoints.protocol, protocol),
      eq(schema.serverEndpoints.host, host),
      eq(schema.serverEndpoints.port, port),
    ),
  });
  const hotUntil = new Date(Date.now() + POLL.hotWindowMs);
  if (existing) {
    await db
      .update(schema.serverEndpoints)
      .set({ dormant: false, hotUntil, nextPollAt: new Date(), resolvedIp: target.ip })
      .where(eq(schema.serverEndpoints.id, existing.id));
    return existing.id;
  }

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(distinct ${schema.serverEndpoints.port})::int` })
    .from(schema.serverEndpoints)
    .where(eq(schema.serverEndpoints.resolvedIp, target.ip));
  if (n >= MAX_ENDPOINTS_PER_IP) {
    throw new AppError('forbidden', 'Too many servers are registered at this address.');
  }
  const id = newId();
  await db
    .insert(schema.serverEndpoints)
    .values({ id, protocol, host, port, resolvedIp: target.ip, hotUntil, nextPollAt: new Date() })
    .onConflictDoNothing();
  const row = await db.query.serverEndpoints.findFirst({
    where: and(
      eq(schema.serverEndpoints.protocol, protocol),
      eq(schema.serverEndpoints.host, host),
      eq(schema.serverEndpoints.port, port),
    ),
  });
  return row!.id;
}

export async function addServer(ctx: MemberContext, raw: unknown): Promise<ServerView> {
  requirePerm(ctx, Permission.MANAGE_SERVERS);
  const input = serverInputSchema.parse(raw);
  const userId = ctx.userId!;
  await enforceRateLimit(
    `server-add:${userId}`,
    10,
    3600,
    'You can add up to 10 servers per hour.',
  );

  const [{ n: communityCount } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.gameServers)
    .where(
      and(
        eq(schema.gameServers.communityId, ctx.community.id),
        isNull(schema.gameServers.deletedAt),
      ),
    );
  if (communityCount >= MAX_SERVERS_PER_COMMUNITY) {
    throw new AppError(
      'forbidden',
      `A community can link up to ${MAX_SERVERS_PER_COMMUNITY} servers.`,
    );
  }
  const [{ n: unverified } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.gameServers)
    .where(
      and(
        eq(schema.gameServers.ownerId, userId),
        isNull(schema.gameServers.verifiedAt),
        isNull(schema.gameServers.deletedAt),
      ),
    );
  const account = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const young = account && Date.now() - account.createdAt.getTime() < 24 * 3600_000;
  const cap = young ? 2 : MAX_UNVERIFIED_PER_USER;
  if (unverified >= cap) {
    throw new AppError(
      'forbidden',
      `Verify your existing servers before adding more (limit ${cap} unverified).`,
    );
  }

  const endpointId = await findOrCreateEndpoint(input.protocol, input.host, input.port);
  const game = await db.query.games.findFirst({ where: eq(schema.games.protocol, input.protocol) });
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(schema.gameServers).values({
      id,
      endpointId,
      communityId: ctx.community.id,
      ownerId: userId,
      gameId: game?.id ?? null,
      name: input.name,
      description: input.description,
      tags: [...new Set(input.tags.filter(Boolean))],
      region: input.region,
      listed: input.listed,
      verifyToken: `mx-${randomToken(10)}`,
    });
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: userId,
      action: 'server.add',
      targetType: 'server',
      targetId: id,
      diff: { address: displayAddress(input.protocol, input.host, input.port) },
    });
  });
  await enqueue(
    QUEUES.poll,
    'poll-endpoint',
    { endpointId },
    { jobId: `poll-${endpointId}-${Date.now()}` },
  );
  const [view] = await queryViews(eq(schema.gameServers.id, id), { showToken: true });
  return view!;
}

async function loadServer(ctx: MemberContext, id: string) {
  const row = await db.query.gameServers.findFirst({
    where: and(
      eq(schema.gameServers.id, id),
      eq(schema.gameServers.communityId, ctx.community.id),
      isNull(schema.gameServers.deletedAt),
    ),
  });
  if (!row) throw notFound('Server');
  return row;
}

export async function updateServer(ctx: MemberContext, id: string, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_SERVERS);
  const row = await loadServer(ctx, id);
  const input = serverInputSchema.parse(raw);
  const endpoint = await db.query.serverEndpoints.findFirst({
    where: eq(schema.serverEndpoints.id, row.endpointId),
  });
  const addressChanged =
    !endpoint ||
    endpoint.protocol !== input.protocol ||
    endpoint.host !== input.host ||
    endpoint.port !== input.port;
  const endpointId = addressChanged
    ? await findOrCreateEndpoint(input.protocol, input.host, input.port)
    : row.endpointId;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.gameServers)
      .set({
        endpointId,
        name: input.name,
        description: input.description,
        tags: [...new Set(input.tags.filter(Boolean))],
        region: input.region,
        listed: input.listed,
        // A new address must be verified again.
        ...(addressChanged ? { verifiedAt: null, verifyToken: `mx-${randomToken(10)}` } : {}),
      })
      .where(eq(schema.gameServers.id, id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'server.update',
      targetType: 'server',
      targetId: id,
    });
  });
  if (addressChanged) {
    await enqueue(
      QUEUES.poll,
      'poll-endpoint',
      { endpointId },
      { jobId: `poll-${endpointId}-${Date.now()}` },
    );
  }
}

export async function removeServer(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_SERVERS);
  const row = await loadServer(ctx, id);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.gameServers)
      .set({ deletedAt: new Date() })
      .where(eq(schema.gameServers.id, row.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'server.remove',
      targetType: 'server',
      targetId: id,
      diff: { name: row.name },
    });
  });
}

/** Ask the worker to poll now (verification checks, "refresh" button). Cached for 30 s. */
export async function requestRefresh(
  ctx: MemberContext,
  id: string,
): Promise<{ queued: boolean; retryInSeconds: number }> {
  requirePerm(ctx, Permission.MANAGE_SERVERS);
  const row = await loadServer(ctx, id);
  await enforceRateLimit(`server-refresh:${ctx.userId}`, 20, 600);
  const endpoint = await db.query.serverEndpoints.findFirst({
    where: eq(schema.serverEndpoints.id, row.endpointId),
  });
  if (
    endpoint?.lastCheckedAt &&
    Date.now() - endpoint.lastCheckedAt.getTime() < POLL.refreshCacheMs
  ) {
    // Checked moments ago: don't query again now, but schedule one check for when the cache
    // window ends. It's a separate delayed job so an in-flight poll can't overwrite it, and the
    // job id collapses repeated clicks within the window into one.
    const due = endpoint.lastCheckedAt.getTime() + POLL.refreshCacheMs;
    await db
      .update(schema.serverEndpoints)
      .set({ hotUntil: new Date(Date.now() + POLL.hotWindowMs) })
      .where(eq(schema.serverEndpoints.id, row.endpointId));
    await enqueue(
      QUEUES.poll,
      'poll-endpoint',
      { endpointId: row.endpointId },
      {
        delay: Math.max(0, due - Date.now()),
        jobId: `poll-${row.endpointId}-refresh-${Math.floor(due / POLL.refreshCacheMs)}`,
      },
    );
    return { queued: false, retryInSeconds: Math.max(1, Math.ceil((due - Date.now()) / 1000)) };
  }
  await db
    .update(schema.serverEndpoints)
    .set({ hotUntil: new Date(Date.now() + POLL.hotWindowMs), dormant: false })
    .where(eq(schema.serverEndpoints.id, row.endpointId));
  await enqueue(
    QUEUES.poll,
    'poll-endpoint',
    { endpointId: row.endpointId },
    { jobId: `poll-${row.endpointId}-${Date.now()}` },
  );
  return { queued: true, retryInSeconds: 0 };
}

/** Viewers looking at a server keep it on the fast polling tier. */
export async function markEndpointsHot(endpointIds: string[]): Promise<void> {
  if (!endpointIds.length) return;
  await db
    .update(schema.serverEndpoints)
    .set({ hotUntil: new Date(Date.now() + POLL.hotWindowMs), dormant: false })
    .where(
      and(
        inArray(schema.serverEndpoints.id, endpointIds),
        or(
          isNull(schema.serverEndpoints.hotUntil),
          sql`${schema.serverEndpoints.hotUntil} < now() + interval '5 minutes'`,
        ),
      ),
    );
}

export async function countOnlineServers(
  communityId: string,
): Promise<{ total: number; online: number; players: number }> {
  const views = await listCommunityServers(communityId);
  return {
    total: views.length,
    online: views.filter((v) => v.status.online).length,
    players: views.reduce((acc, v) => acc + (v.status.online ? (v.status.players ?? 0) : 0), 0),
  };
}

/** Headline numbers for the home page: public communities, listed servers online, players. */
export async function platformStats(): Promise<{
  communities: number;
  serversOnline: number;
  players: number;
}> {
  const [c, s] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.communities)
      .where(
        and(eq(schema.communities.visibility, 'public'), isNull(schema.communities.deletedAt)),
      ),
    // Each endpoint counts once, however many listings point at it.
    db.execute<{ online: number; players: number }>(sql`
      select count(*) filter (where e.online)::int as online,
             coalesce(sum(e.players) filter (where e.online), 0)::int as players
      from server_endpoints e
      where exists (
        select 1 from game_servers g
        where g.endpoint_id = e.id and g.listed and g.verified_at is not null and g.deleted_at is null
      )`),
  ]);
  const row = [...s][0];
  return {
    communities: c[0]?.n ?? 0,
    serversOnline: Number(row?.online ?? 0),
    players: Number(row?.players ?? 0),
  };
}
