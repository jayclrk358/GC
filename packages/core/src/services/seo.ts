import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import type { Theme } from '@magnox/shared';
import { mediaUrl } from '../storage';

// What search engines and link previews see: public pages only.

/** Public communities and listed game servers, for the sitemap (most active first). */
export async function sitemapEntries() {
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
  return { communities, servers };
}

export interface ShareCard {
  name: string;
  tagline: string;
  memberCount: number;
  game: string | null;
  iconUrl: string | null;
  colors: { bg: string; surface: string; text: string; muted: string; primary: string };
}

/** What a community's link preview shows. Only for public communities. */
export async function communityShareCard(slug: string): Promise<ShareCard | null> {
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
      and(
        eq(c.slug, slug.toLowerCase()),
        eq(c.visibility, 'public'),
        isNull(c.deletedAt),
        isNull(c.suspendedAt),
      ),
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
