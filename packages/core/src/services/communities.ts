import { and, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import { db, schema } from '@magnox/db';
import {
  blockConfigSchemas,
  checkTheme,
  communityBasicsSchema,
  createCommunitySchema,
  DEFAULT_EVERYONE,
  docFromText,
  isValidSlug,
  navSchema,
  newId,
  PRESET_KEYS,
  themeFromPreset,
  themeSchema,
  type CommunityTemplate,
  type PresetKey,
  type Theme,
} from '@magnox/shared';
import { z } from 'zod';
import { requirePerm, type MemberContext } from '../access';
import { AppError, conflict, forbidden } from '../errors';
import { enforceRateLimit } from '../ratelimit';
import { TEMPLATES } from '../templates';
import { Permission } from '@magnox/shared';
import { audit, diffOf } from './audit';
import { cached } from '../cache';

const MAX_OWNED_COMMUNITIES = 10;

export type CommunityRow = typeof schema.communities.$inferSelect;

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const s = slug.trim().toLowerCase();
  if (!isValidSlug(s)) return false;
  const rows = await db
    .select({ id: schema.communities.id })
    .from(schema.communities)
    .where(eq(schema.communities.slug, s))
    .limit(1);
  return rows.length === 0;
}

export async function createCommunity(
  userId: string,
  raw: unknown,
): Promise<{ id: string; slug: string }> {
  const input = createCommunitySchema.parse(raw);
  await enforceRateLimit(
    `community-create:${userId}`,
    5,
    24 * 3600,
    'You can create up to 5 communities per day.',
  );

  const [{ owned } = { owned: 0 }] = await db
    .select({ owned: count() })
    .from(schema.communities)
    .where(and(eq(schema.communities.ownerId, userId), isNull(schema.communities.deletedAt)));
  if (owned >= MAX_OWNED_COMMUNITIES) {
    throw new AppError('forbidden', `You can own up to ${MAX_OWNED_COMMUNITIES} communities.`);
  }
  if (!(await isSlugAvailable(input.slug))) {
    throw new AppError('conflict', 'That address is already taken.', {
      fields: { slug: 'Already taken' },
    });
  }
  if (input.gameId) {
    const game = await db.query.games.findFirst({ where: eq(schema.games.id, input.gameId) });
    if (!game)
      throw new AppError('validation', 'Unknown game.', { fields: { gameId: 'Unknown game' } });
  }

  const preset = (PRESET_KEYS as string[]).includes(input.preset)
    ? (input.preset as PresetKey)
    : 'magnox';
  const template = TEMPLATES[input.template];
  const id = newId();

  await db.transaction(async (tx) => {
    await tx.insert(schema.communities).values({
      id,
      slug: input.slug,
      name: input.name,
      tagline: input.tagline,
      gameId: input.gameId,
      ownerId: userId,
      visibility: input.visibility,
      joinMode: input.joinMode,
      nsfw: input.nsfw,
      region: input.region,
      language: input.language,
      tags: [...new Set(input.tags)],
      template: input.template,
      theme: themeFromPreset(preset),
      nav: template.nav,
      settings: { showMemberCount: true },
      memberCount: 1,
    });

    await tx.insert(schema.roles).values({
      id: newId(),
      communityId: id,
      name: '@everyone',
      position: 0,
      permissions: DEFAULT_EVERYONE,
      isDefault: true,
    });
    const roleCount = template.roles.length;
    await tx.insert(schema.roles).values(
      template.roles.map((r, i) => ({
        id: newId(),
        communityId: id,
        name: r.name,
        color: r.color,
        permissions: r.permissions,
        hoist: r.hoist,
        selfAssignable: r.selfAssignable ?? false,
        position: roleCount - i,
      })),
    );

    await tx.insert(schema.members).values({ communityId: id, userId });

    await insertStarterContent(tx, {
      communityId: id,
      template: input.template,
      name: input.name,
      userId,
    });

    const blocks = template.blocks({ name: input.name, tagline: input.tagline });
    const keys = generateNKeysBetween(null, null, blocks.length);
    if (blocks.length) {
      await tx.insert(schema.pageBlocks).values(
        blocks.map((b, i) => ({
          id: newId(),
          communityId: id,
          type: b.type,
          position: keys[i]!,
          visible: true,
          config: blockConfigSchemas[b.type].parse(b.config) as Record<string, unknown>,
        })),
      );
    }

    await audit(tx, {
      communityId: id,
      actorId: userId,
      action: 'community.create',
      diff: { template: input.template },
    });
  });

  return { id, slug: input.slug };
}

export async function getCommunityRow(id: string): Promise<CommunityRow> {
  const row = await db.query.communities.findFirst({ where: eq(schema.communities.id, id) });
  if (!row) throw new AppError('not_found', 'Community could not be found.');
  return row;
}

const basicsUpdateSchema = communityBasicsSchema.omit({ slug: true }).partial();

export async function updateCommunityBasics(ctx: MemberContext, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const input = basicsUpdateSchema.parse(raw);
  if (input.gameId) {
    const game = await db.query.games.findFirst({ where: eq(schema.games.id, input.gameId) });
    if (!game)
      throw new AppError('validation', 'Unknown game.', { fields: { gameId: 'Unknown game' } });
  }
  const before = await getCommunityRow(ctx.community.id);
  const patch = { ...input, ...(input.tags ? { tags: [...new Set(input.tags)] } : {}) };
  await db.transaction(async (tx) => {
    await tx
      .update(schema.communities)
      .set(patch)
      .where(eq(schema.communities.id, ctx.community.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'community.update',
      diff: diffOf(before as unknown as Record<string, unknown>, patch),
    });
  });
}

export async function changeSlug(ctx: MemberContext, raw: unknown): Promise<string> {
  if (!ctx.isOwner) throw forbidden('Only the owner can change the community address.');
  const slug = z.object({ slug: communityBasicsSchema.shape.slug }).parse(raw).slug;
  if (slug === ctx.community.slug) return slug;
  await enforceRateLimit(`slug-change:${ctx.community.id}`, 3, 24 * 3600);
  if (!(await isSlugAvailable(slug))) throw conflict('That address is already taken.');
  await db.transaction(async (tx) => {
    await tx
      .update(schema.communities)
      .set({ slug })
      .where(eq(schema.communities.id, ctx.community.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'community.slug',
      diff: { slug: { from: ctx.community.slug, to: slug } },
    });
  });
  return slug;
}

async function assertUploadsExist(keys: (string | undefined)[]): Promise<void> {
  const wanted = keys.filter((k): k is string => Boolean(k));
  if (!wanted.length) return;
  const rows = await db
    .select({ key: schema.uploads.key })
    .from(schema.uploads)
    .where(inArray(schema.uploads.key, wanted));
  if (rows.length !== new Set(wanted).size)
    throw new AppError('validation', 'One of the images could not be found.');
}

export async function updateCommunityTheme(ctx: MemberContext, raw: unknown): Promise<Theme> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const theme = themeSchema.parse(raw);
  const issues = checkTheme(theme);
  if (issues.length) {
    throw new AppError(
      'validation',
      `${issues.length} colour pair${issues.length === 1 ? '' : 's'} don't meet contrast requirements. Fix them before saving.`,
    );
  }
  await assertUploadsExist([theme.bannerKey, theme.iconKey, theme.backgroundKey]);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.communities)
      .set({ theme })
      .where(eq(schema.communities.id, ctx.community.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'community.theme',
    });
  });
  return theme;
}

export async function updateCommunityNav(ctx: MemberContext, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const nav = navSchema.parse(raw);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.communities)
      .set({ nav })
      .where(eq(schema.communities.id, ctx.community.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'community.nav',
    });
  });
}

const settingsSchema = z.object({
  requireAltText: z.boolean().optional(),
  welcomeMessage: z.string().trim().max(500).optional(),
  showMemberCount: z.boolean().optional(),
});

export async function updateCommunitySettings(ctx: MemberContext, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const input = settingsSchema.parse(raw);
  const row = await getCommunityRow(ctx.community.id);
  await db
    .update(schema.communities)
    .set({ settings: { ...row.settings, ...input } })
    .where(eq(schema.communities.id, ctx.community.id));
}

export async function deleteCommunity(ctx: MemberContext, confirmSlug: string): Promise<void> {
  if (!ctx.isOwner) throw forbidden('Only the owner can delete this community.');
  if (confirmSlug.trim().toLowerCase() !== ctx.community.slug) {
    throw new AppError('validation', 'Type the community address exactly to confirm.');
  }
  await db.transaction(async (tx) => {
    // Free the slug (it can be reused) and hide the community. Data is kept for 30 days.
    await tx
      .update(schema.communities)
      .set({ deletedAt: new Date(), slug: `deleted-${ctx.community.id}`, visibility: 'private' })
      .where(eq(schema.communities.id, ctx.community.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'community.delete',
    });
  });
}

export interface ExploreFilters {
  q?: string;
  game?: string;
  tag?: string;
  region?: string;
  language?: string;
  sort?: 'popular' | 'new' | 'relevance';
  page?: number;
  pageSize?: number;
}

export interface CommunityCard {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  gameId: string | null;
  gameName: string | null;
  tags: string[];
  region: string;
  language: string;
  memberCount: number;
  joinMode: string;
  theme: Theme;
  createdAt: Date;
}

export async function exploreCommunities(
  f: ExploreFilters,
): Promise<{ items: CommunityCard[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(48, Math.max(1, f.pageSize ?? 24));
  const page = Math.max(0, f.page ?? 0);
  const c = schema.communities;
  const where: SQL[] = [eq(c.visibility, 'public'), isNull(c.deletedAt)];
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    where.push(
      sql`(${c.search} @@ websearch_to_tsquery('simple', ${q}) OR ${c.name} % ${q} OR ${c.name} ILIKE ${`%${q.replace(/[%_\\]/g, '\\$&')}%`} OR ${q} = ANY(${c.tags}))`,
    );
  }
  if (f.game) where.push(eq(c.gameId, f.game));
  if (f.tag) where.push(sql`${f.tag.toLowerCase()} = ANY(${c.tags})`);
  if (f.region) where.push(eq(c.region, f.region));
  if (f.language) where.push(eq(c.language, f.language));

  const sort = f.sort ?? (q ? 'relevance' : 'popular');
  const order =
    sort === 'new'
      ? [desc(c.createdAt)]
      : sort === 'relevance' && q
        ? [
            desc(
              sql`ts_rank(${c.search}, websearch_to_tsquery('simple', ${q})) + similarity(${c.name}, ${q})`,
            ),
            desc(c.memberCount),
          ]
        : [desc(c.memberCount), desc(c.createdAt)];

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: c.id,
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        gameId: c.gameId,
        gameName: schema.games.name,
        tags: c.tags,
        region: c.region,
        language: c.language,
        memberCount: c.memberCount,
        joinMode: c.joinMode,
        theme: c.theme,
        createdAt: c.createdAt,
      })
      .from(c)
      .leftJoin(schema.games, eq(schema.games.id, c.gameId))
      .where(and(...where))
      .orderBy(...order)
      .limit(pageSize)
      .offset(page * pageSize),
    db
      .select({ n: count() })
      .from(c)
      .where(and(...where)),
  ]);
  return { items: rows, total: totals[0]?.n ?? 0, page, pageSize };
}

export async function searchCommunities(q: string, limit = 6) {
  const { items } = await exploreCommunities({ q, sort: 'relevance', pageSize: limit });
  return items.map((i) => ({ slug: i.slug, name: i.name, tagline: i.tagline }));
}

/** Communities a user belongs to (for sidebars and profiles). */
export async function communitiesForUser(userId: string, opts: { publicOnly?: boolean } = {}) {
  const c = schema.communities;
  const where: SQL[] = [eq(schema.members.userId, userId), isNull(c.deletedAt)];
  if (opts.publicOnly) where.push(eq(c.visibility, 'public'));
  return db
    .select({
      id: c.id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      theme: c.theme,
      memberCount: c.memberCount,
      ownerId: c.ownerId,
    })
    .from(schema.members)
    .innerJoin(c, eq(c.id, schema.members.communityId))
    .where(and(...where))
    .orderBy(desc(schema.members.joinedAt))
    .limit(100);
}

/** The game catalogue (it only changes with a deploy or seed, so it's cached briefly). */
export async function listGames() {
  return cached('games', 300, () =>
    db
      .select({ id: schema.games.id, name: schema.games.name, protocol: schema.games.protocol })
      .from(schema.games)
      .orderBy(schema.games.name),
  );
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Default channels and a wiki home page from the community's template. */
async function insertStarterContent(
  tx: Tx,
  {
    communityId,
    template: templateId,
    name,
    userId,
  }: { communityId: string; template: CommunityTemplate; name: string; userId: string },
) {
  const template = TEMPLATES[templateId];
  let position = 1;
  for (const group of template.channels) {
    const categoryId = newId();
    await tx.insert(schema.channels).values({
      id: categoryId,
      communityId,
      type: 'category',
      name: group.category,
      position: position++,
    });
    for (const ch of group.channels) {
      await tx.insert(schema.channels).values({
        id: newId(),
        communityId,
        parentId: categoryId,
        type: ch.type,
        name: ch.name,
        topic: ch.topic,
        settings: {
          voting: false,
          qa: false,
          requireFlair: false,
          defaultSort: 'latest',
          ...ch.settings,
        },
        position: position++,
      });
    }
  }
  const wikiId = newId();
  const wikiRevisionId = newId();
  const welcome = `Welcome to the ${name} wiki. Members with the Edit wiki permission can add pages.`;
  await tx.insert(schema.wikiPages).values({
    id: wikiId,
    communityId,
    slug: 'home',
    title: 'Home',
    body: docFromText(welcome),
    bodyText: welcome,
    currentRevisionId: wikiRevisionId,
    createdBy: userId,
    updatedBy: userId,
  });
  await tx.insert(schema.wikiRevisions).values({
    id: wikiRevisionId,
    pageId: wikiId,
    authorId: userId,
    title: 'Home',
    body: docFromText(welcome),
    bodyText: welcome,
    summary: 'Created page',
  });
}

/**
 * Give an existing community the starter channels and wiki page if it has none (communities
 * created before forums existed). Used by the demo seed.
 */
export async function ensureStarterContent(communityId: string): Promise<boolean> {
  const community = await db.query.communities.findFirst({
    where: eq(schema.communities.id, communityId),
  });
  if (!community) return false;
  const existing = await db.query.channels.findFirst({
    where: eq(schema.channels.communityId, communityId),
  });
  if (existing) return false;
  const hasWiki = await db.query.wikiPages.findFirst({
    where: eq(schema.wikiPages.communityId, communityId),
  });
  if (hasWiki) return false;
  await db.transaction((tx) =>
    insertStarterContent(tx, {
      communityId,
      template: (community.template in TEMPLATES
        ? community.template
        : 'fanhub') as CommunityTemplate,
      name: community.name,
      userId: community.ownerId,
    }),
  );
  return true;
}

/**
 * Add the template's chat channels to a community that has none (communities created before
 * chat existed). Used by the demo seed. Returns how many channels were added.
 */
export async function ensureChatChannels(communityId: string): Promise<number> {
  const community = await db.query.communities.findFirst({
    where: eq(schema.communities.id, communityId),
  });
  if (!community) return 0;
  const existing = await db
    .select({
      id: schema.channels.id,
      name: schema.channels.name,
      type: schema.channels.type,
      position: schema.channels.position,
    })
    .from(schema.channels)
    .where(eq(schema.channels.communityId, communityId));
  if (existing.some((c) => c.type === 'text')) return 0;
  const template =
    TEMPLATES[
      (community.template in TEMPLATES ? community.template : 'fanhub') as CommunityTemplate
    ];
  const taken = new Set(existing.map((c) => c.name));
  let added = 0;
  await db.transaction(async (tx) => {
    let position = Math.max(0, ...existing.map((c) => c.position)) + 1;
    for (const group of template.channels) {
      const text = group.channels.filter((c) => c.type === 'text' && !taken.has(c.name));
      if (!text.length) continue;
      const categoryId = newId();
      await tx.insert(schema.channels).values({
        id: categoryId,
        communityId,
        type: 'category',
        name: group.category,
        position: position++,
      });
      for (const ch of text) {
        await tx.insert(schema.channels).values({
          id: newId(),
          communityId,
          parentId: categoryId,
          type: 'text',
          name: ch.name,
          topic: ch.topic,
          position: position++,
        });
        added++;
      }
    }
  });
  return added;
}
