import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import { serverSearchSchema, type ServerSearch } from '@gamecentral/shared';
import { notFound } from '../errors';
import { queryServerViews, type ServerView } from './servers';
import { recentVoteCount } from './history';
import { voteStatus, type VoteStatus } from './votes';
import { cached } from '../cache';

export const BROWSER_PAGE_SIZE = 24;

export interface BrowserServer extends ServerView {
  community: { slug: string; name: string } | null;
  gameName: string | null;
}

async function withCommunities(views: ServerView[]): Promise<BrowserServer[]> {
  const communityIds = [...new Set(views.map((v) => v.communityId).filter(Boolean))] as string[];
  const serverIds = views.map((v) => v.id);
  const [communities, games] = await Promise.all([
    communityIds.length
      ? db
          .select({
            id: schema.communities.id,
            slug: schema.communities.slug,
            name: schema.communities.name,
            visibility: schema.communities.visibility,
          })
          .from(schema.communities)
          .where(
            and(inArray(schema.communities.id, communityIds), isNull(schema.communities.deletedAt)),
          )
      : [],
    serverIds.length
      ? db
          .select({ id: schema.gameServers.id, gameName: schema.games.name })
          .from(schema.gameServers)
          .innerJoin(schema.games, eq(schema.games.id, schema.gameServers.gameId))
          .where(inArray(schema.gameServers.id, serverIds))
      : [],
  ]);
  const byId = new Map(communities.map((c) => [c.id, c]));
  const gameById = new Map(games.map((g) => [g.id, g.gameName]));
  return views.map((v) => {
    const c = v.communityId ? byId.get(v.communityId) : undefined;
    return {
      ...v,
      // Private communities aren't linked from public pages.
      community: c && c.visibility === 'public' ? { slug: c.slug, name: c.name } : null,
      gameName: gameById.get(v.id) ?? null,
    };
  });
}

function browserWhere(f: ServerSearch): SQL {
  const gs = schema.gameServers;
  const ep = schema.serverEndpoints;
  const where: SQL[] = [eq(gs.listed, true), isNotNull(gs.verifiedAt), isNull(gs.deletedAt)];
  if (f.q) {
    const pat = `%${f.q.replace(/[%_\\]/g, '\\$&')}%`;
    where.push(
      or(
        sql`${gs.name} ILIKE ${pat}`,
        sql`${gs.description} ILIKE ${pat}`,
        sql`${f.q.toLowerCase()} = ANY(${gs.tags})`,
      )!,
    );
  }
  if (f.game) where.push(eq(gs.gameId, f.game));
  if (f.tag) where.push(sql`${f.tag} = ANY(${gs.tags})`);
  if (f.region) where.push(eq(gs.region, f.region));
  if (f.online || f.minPlayers) where.push(eq(ep.online, true));
  if (f.minPlayers) where.push(gte(ep.players, f.minPlayers));
  return and(...where)!;
}

function browserOrder(sort: ServerSearch['sort']): SQL[] {
  const gs = schema.gameServers;
  const ep = schema.serverEndpoints;
  switch (sort) {
    case 'votes':
      return [desc(gs.voteCount), desc(ep.online), asc(gs.name)];
    case 'new':
      return [desc(gs.createdAt)];
    case 'name':
      return [asc(sql`lower(${gs.name})`), asc(gs.id)];
    default:
      return [desc(ep.online), sql`${ep.players} desc nulls last`, desc(gs.voteCount), asc(gs.id)];
  }
}

/** The public server browser: listed, verified servers with filters, sorting and paging. */
export async function searchServers(raw: unknown): Promise<{
  items: BrowserServer[];
  total: number;
  page: number;
  pageSize: number;
  filters: ServerSearch;
}> {
  const f = serverSearchSchema.parse(raw ?? {});
  const where = browserWhere(f);
  const [views, totals] = await Promise.all([
    queryServerViews(where, {
      showToken: false,
      order: browserOrder(f.sort),
      limit: BROWSER_PAGE_SIZE,
      offset: f.page * BROWSER_PAGE_SIZE,
    }),
    db
      .select({ n: count() })
      .from(schema.gameServers)
      .innerJoin(
        schema.serverEndpoints,
        eq(schema.serverEndpoints.id, schema.gameServers.endpointId),
      )
      .where(where),
  ]);
  return {
    items: await withCommunities(views),
    total: totals[0]?.n ?? 0,
    page: f.page,
    pageSize: BROWSER_PAGE_SIZE,
    filters: f,
  };
}

/** Games that have at least one server in the browser, for the filter menu. */
export async function browserGames(): Promise<{ id: string; name: string; count: number }[]> {
  return cached('browser-games', 60, () => loadBrowserGames());
}

function loadBrowserGames() {
  return db
    .select({ id: schema.games.id, name: schema.games.name, count: count() })
    .from(schema.gameServers)
    .innerJoin(schema.games, eq(schema.games.id, schema.gameServers.gameId))
    .where(
      and(
        eq(schema.gameServers.listed, true),
        isNotNull(schema.gameServers.verifiedAt),
        isNull(schema.gameServers.deletedAt),
      ),
    )
    .groupBy(schema.games.id, schema.games.name)
    .orderBy(asc(schema.games.name));
}

export interface ServerDetail extends BrowserServer {
  votesThisMonth: number;
  vote: VoteStatus;
  /** Minecraft server with Votifier set up: voting can reward a player in game. */
  rewards: boolean;
  lastOnlineAt: string | null;
  downSince: string | null;
  dormant: boolean;
  /** Visible only to its owner (not listed or not verified yet). */
  private: boolean;
}

/**
 * A server's public page. Listed, verified servers are public; anything else is only visible to
 * the person who added it.
 */
export async function getServerDetail(id: string, viewerId: string | null): Promise<ServerDetail> {
  const [row] = await db
    .select({
      ownerId: schema.gameServers.ownerId,
      listed: schema.gameServers.listed,
      verifiedAt: schema.gameServers.verifiedAt,
      votifierHost: schema.gameServers.votifierHost,
      votifierToken: schema.gameServers.votifierToken,
      votifierPublicKey: schema.gameServers.votifierPublicKey,
      lastOnlineAt: schema.serverEndpoints.lastOnlineAt,
      downSince: schema.serverEndpoints.downSince,
      dormant: schema.serverEndpoints.dormant,
    })
    .from(schema.gameServers)
    .innerJoin(schema.serverEndpoints, eq(schema.serverEndpoints.id, schema.gameServers.endpointId))
    .where(and(eq(schema.gameServers.id, id), isNull(schema.gameServers.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Server');
  const isPublic = row.listed && Boolean(row.verifiedAt);
  if (!isPublic && row.ownerId !== viewerId) throw notFound('Server');
  const [view] = await queryServerViews(eq(schema.gameServers.id, id), { showToken: false });
  if (!view) throw notFound('Server');
  const [[server], votesThisMonth, vote] = await Promise.all([
    withCommunities([view]),
    recentVoteCount(id),
    voteStatus(viewerId, id),
  ]);
  return {
    ...server!,
    votesThisMonth,
    vote,
    rewards:
      view.protocol === 'minecraft' &&
      Boolean(row.votifierHost && (row.votifierToken || row.votifierPublicKey)),
    lastOnlineAt: row.lastOnlineAt?.toISOString() ?? null,
    downSince: row.downSince?.toISOString() ?? null,
    dormant: row.dormant,
    private: !isPublic,
  };
}
