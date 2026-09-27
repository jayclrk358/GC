import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  ACCOUNT_KINDS,
  hexColor,
  isTimeZone,
  LANGUAGES,
  MAX_PLAYSTYLES,
  MAX_PROFILE_LANGUAGES,
  normaliseHandle,
  PLATFORMS,
  PLAYSTYLES,
} from '@magnox/shared';
import { z } from 'zod';
import { AppError } from '../errors';
import { mediaUrl } from '../storage';
import { communitiesForUser } from './communities';

const profileSchema = z.object({
  bio: z.string().trim().max(500).default(''),
  pronouns: z.string().trim().max(40).default(''),
  location: z.string().trim().max(60).default(''),
  accentColor: hexColor.nullable().default(null),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        url: z
          .string()
          .trim()
          .url()
          .max(300)
          .refine((u) => /^https:\/\//i.test(u), 'Links must start with https://'),
      }),
    )
    .max(8)
    .default([]),
  favoriteGames: z.array(z.string().max(64)).max(10).default([]),
  status: z.string().trim().max(80).default(''),
  timezone: z
    .string()
    .trim()
    .max(64)
    .default('')
    .refine((v) => v === '' || isTimeZone(v), 'Pick a time zone from the list'),
  languages: z
    .array(z.enum(LANGUAGES))
    .max(MAX_PROFILE_LANGUAGES)
    .default([])
    .transform((v) => [...new Set(v)]),
  platforms: z
    .array(z.enum(PLATFORMS))
    .default([])
    .transform((v) => [...new Set(v)]),
  playstyles: z
    .array(z.enum(PLAYSTYLES))
    .max(MAX_PLAYSTYLES, `Pick up to ${MAX_PLAYSTYLES}`)
    .default([])
    .transform((v) => [...new Set(v)]),
  lookingForGroup: z.boolean().default(false),
  nowPlaying: z.string().max(64).nullable().default(null),
  accounts: z.object(accountShape()).default({}),
  avatarKey: z.string().nullable().optional(),
  bannerKey: z.string().nullable().optional(),
});

/** One optional, validated field per account kind; blanks are dropped. */
function accountShape() {
  const shape: Record<string, z.ZodType<string | undefined>> = {};
  for (const kind of ACCOUNT_KINDS) {
    shape[kind.key] = z
      .string()
      .max(64)
      .optional()
      .transform((v) => (v ? normaliseHandle(kind.key, v) : undefined))
      .refine(
        (v) => v === undefined || kind.pattern.test(v),
        `That doesn't look like a ${kind.label} name`,
      );
  }
  return shape;
}

async function assertOwnUpload(userId: string, key: string | null | undefined, purpose: string) {
  if (!key) return;
  const row = await db.query.uploads.findFirst({
    where: and(eq(schema.uploads.key, key), eq(schema.uploads.ownerId, userId)),
  });
  if (!row || row.purpose !== purpose)
    throw new AppError('validation', 'That image could not be found.');
}

export async function updateProfile(userId: string, raw: unknown): Promise<void> {
  const input = profileSchema.parse(raw);
  await assertOwnUpload(userId, input.avatarKey, 'avatar');
  await assertOwnUpload(userId, input.bannerKey, 'banner');
  const gameIds = [...input.favoriteGames, ...(input.nowPlaying ? [input.nowPlaying] : [])];
  if (gameIds.length) {
    const rows = await db
      .select({ id: schema.games.id })
      .from(schema.games)
      .where(inArray(schema.games.id, gameIds));
    const known = new Set(rows.map((r) => r.id));
    input.favoriteGames = input.favoriteGames.filter((g) => known.has(g));
    if (input.nowPlaying && !known.has(input.nowPlaying)) input.nowPlaying = null;
  }
  const accounts = Object.fromEntries(
    Object.entries(input.accounts).filter((e): e is [string, string] => Boolean(e[1])),
  );
  await db.transaction(async (tx) => {
    const values = {
      bio: input.bio,
      pronouns: input.pronouns,
      location: input.location,
      accentColor: input.accentColor,
      links: input.links,
      favoriteGames: input.favoriteGames,
      status: input.status,
      timezone: input.timezone,
      languages: input.languages,
      platforms: input.platforms,
      playstyles: input.playstyles,
      lookingForGroup: input.lookingForGroup,
      nowPlaying: input.nowPlaying,
      accounts,
      ...(input.avatarKey !== undefined ? { avatarKey: input.avatarKey } : {}),
      ...(input.bannerKey !== undefined ? { bannerKey: input.bannerKey } : {}),
    };
    await tx
      .insert(schema.userProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: schema.userProfiles.userId, set: values });
    if (input.avatarKey !== undefined) {
      await tx
        .update(schema.users)
        .set({ image: mediaUrl(input.avatarKey) })
        .where(eq(schema.users.id, userId));
    }
  });
}

export async function getOwnProfile(userId: string) {
  const profile = await db.query.userProfiles.findFirst({
    where: eq(schema.userProfiles.userId, userId),
  });
  return profile ?? null;
}

/** Forum activity in public communities (counts only). */
async function forumStats(userId: string): Promise<{ threads: number; replies: number }> {
  const rows = await db.execute<{ threads: number; replies: number }>(sql`
    select count(*) filter (where p.is_op)::int as threads,
           count(*) filter (where not p.is_op)::int as replies
    from posts p
    join communities c on c.id = p.community_id
    where p.author_id = ${userId} and p.deleted_at is null
      and c.visibility = 'public' and c.deleted_at is null`);
  const row = [...rows][0];
  return { threads: Number(row?.threads ?? 0), replies: Number(row?.replies ?? 0) };
}

/** Communities both people belong to (the viewer is a member, so private ones may show). */
async function sharedCommunities(userId: string, viewerId: string) {
  const rows = await db.execute<{ id: string; slug: string; name: string }>(sql`
    select c.id, c.slug, c.name
    from members a
    join members b on b.community_id = a.community_id and b.user_id = ${viewerId}
    join communities c on c.id = a.community_id and c.deleted_at is null
    where a.user_id = ${userId}
    order by c.name
    limit 12`);
  return [...rows];
}

export async function getPublicProfile(username: string, viewerId?: string | null) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, username.toLowerCase()),
  });
  if (!user || user.banned) return null;
  const profile = await db.query.userProfiles.findFirst({
    where: eq(schema.userProfiles.userId, user.id),
  });
  const gameIds = [
    ...(profile?.favoriteGames ?? []),
    ...(profile?.nowPlaying ? [profile.nowPlaying] : []),
  ];
  const [gameRows, communities, stats, shared] = await Promise.all([
    gameIds.length
      ? db
          .select({ id: schema.games.id, name: schema.games.name })
          .from(schema.games)
          .where(inArray(schema.games.id, gameIds))
      : [],
    communitiesForUser(user.id, { publicOnly: true }),
    forumStats(user.id),
    viewerId && viewerId !== user.id ? sharedCommunities(user.id, viewerId) : [],
  ]);
  const gameName = new Map(gameRows.map((g) => [g.id, g.name]));
  const games = (profile?.favoriteGames ?? [])
    .filter((id) => gameName.has(id))
    .map((id) => ({ id, name: gameName.get(id)! }));
  const nowPlaying = profile?.nowPlaying
    ? { id: profile.nowPlaying, name: gameName.get(profile.nowPlaying) ?? profile.nowPlaying }
    : null;
  // Only kinds we still know about, in the catalogue's order.
  const accounts = ACCOUNT_KINDS.filter((k) => profile?.accounts?.[k.key]).map((k) => ({
    key: k.key,
    handle: profile!.accounts[k.key]!,
  }));
  return {
    id: user.id,
    name: user.name,
    username: user.username!,
    image: user.image,
    createdAt: user.createdAt,
    bio: profile?.bio ?? '',
    pronouns: profile?.pronouns ?? '',
    location: profile?.location ?? '',
    accentColor: profile?.accentColor ?? null,
    links: profile?.links ?? [],
    bannerUrl: mediaUrl(profile?.bannerKey),
    games,
    communities,
    status: profile?.status ?? '',
    timezone: profile?.timezone ?? '',
    languages: profile?.languages ?? [],
    platforms: profile?.platforms ?? [],
    playstyles: profile?.playstyles ?? [],
    lookingForGroup: profile?.lookingForGroup ?? false,
    nowPlaying,
    accounts,
    stats: { ...stats, communities: communities.length },
    shared,
  };
}
