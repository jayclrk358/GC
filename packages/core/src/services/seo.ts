import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import type { Theme } from '@magnox/shared';
import { cached } from '../cache';
import { mediaUrl } from '../storage';

// What search engines and link previews see: public pages only.

export interface SitemapEntries {
  communities: { slug: string; updatedAt: string }[];
  servers: { id: string; updatedAt: string }[];
}

/**
 * Public communities and listed game servers, for the sitemap (most active first). Up to 40,000
 * rows, so it's worked out at most once an hour and shared from the cache.
 */
export async function sitemapEntries(): Promise<SitemapEntries> {
  return cached('sitemap', 3600, loadSitemapEntries);
}

async function loadSitemapEntries(): Promise<SitemapEntries> {
  const c = schema.communities;
  const gs = schema.gameServers;
  const [communities, servers] = await Promise.all([
    db
      .select({ slug: c.slug, updatedAt: c.updatedAt })
      .from(c)
      .where(
        and(
          eq(c.visibility, 'public'),
          eq(c.nsfw, false),
          isNull(c.deletedAt),
          isNull(c.suspendedAt),
        ),
      )
      .orderBy(desc(c.memberCount))
      .limit(20_000),
    db
      .select({ id: gs.id, updatedAt: gs.updatedAt })
      .from(gs)
      .where(and(eq(gs.listed, true), isNotNull(gs.verifiedAt), isNull(gs.deletedAt)))
      .limit(20_000),
  ]);
  return {
    communities: communities.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() })),
    servers: servers.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() })),
  };
}

export interface ShareCard {
  name: string;
  tagline: string;
  memberCount: number;
  game: string | null;
  iconUrl: string | null;
  colors: { bg: string; surface: string; text: string; muted: string; primary: string };
}

/** Thrown inside the cache's loader so a missing community isn't cached (see below). */
const NO_CARD = new Error('no share card');

/**
 * What a community's link preview shows. Only for public communities. Cached for ten minutes;
 * misses aren't, so made-up addresses don't fill the cache.
 */
export async function communityShareCard(slug: string): Promise<ShareCard | null> {
  const s = slug.toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(s)) return null;
  return cached(`share-card:${s}`, 600, async () => {
    const card = await loadShareCard(s);
    if (!card) throw NO_CARD;
    return card;
  }).catch((err: unknown) => {
    if (err === NO_CARD) return null;
    throw err;
  });
}

async function loadShareCard(slug: string): Promise<ShareCard | null> {
  const c = schema.communities;
  const [row] = await db
    .select({
      name: c.name,
      tagline: c.tagline,
      memberCount: c.memberCount,
      theme: c.theme,
      game: schema.games.name,
    })
    .from(c)
    .leftJoin(schema.games, eq(schema.games.id, c.gameId))
    .where(
      and(eq(c.slug, slug), eq(c.visibility, 'public'), isNull(c.deletedAt), isNull(c.suspendedAt)),
    )
    .limit(1);
  if (!row) return null;
  const theme = row.theme as Theme;
  const t = theme.dark;
  return {
    name: row.name,
    tagline: row.tagline,
    memberCount: row.memberCount,
    game: row.game ?? null,
    iconUrl: mediaUrl(theme.iconKey),
    colors: {
      bg: t.bg,
      surface: t.surface,
      text: t.text,
      muted: t.textMuted,
      primary: t.primary,
    },
  };
}
