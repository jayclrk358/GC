import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { hexColor } from '@magnox/shared';
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
  avatarKey: z.string().nullable().optional(),
  bannerKey: z.string().nullable().optional(),
});

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
  if (input.favoriteGames.length) {
    const rows = await db
      .select({ id: schema.games.id })
      .from(schema.games)
      .where(inArray(schema.games.id, input.favoriteGames));
    input.favoriteGames = rows.map((r) => r.id);
  }
  await db.transaction(async (tx) => {
    const values = {
      bio: input.bio,
      pronouns: input.pronouns,
      location: input.location,
      accentColor: input.accentColor,
      links: input.links,
      favoriteGames: input.favoriteGames,
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

export async function getPublicProfile(username: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, username.toLowerCase()),
  });
  if (!user || user.banned) return null;
  const profile = await db.query.userProfiles.findFirst({
    where: eq(schema.userProfiles.userId, user.id),
  });
  const games = profile?.favoriteGames.length
    ? await db
        .select({ id: schema.games.id, name: schema.games.name })
        .from(schema.games)
        .where(inArray(schema.games.id, profile.favoriteGames))
    : [];
  const communities = await communitiesForUser(user.id, { publicOnly: true });
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
  };
}
