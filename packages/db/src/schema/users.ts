import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import type { Prefs } from '@gamecentral/shared';
import { users } from './auth';
import { tz, updatedAt } from './_helpers';

export interface ProfileLink {
  label: string;
  url: string;
}

export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio').notNull().default(''),
  pronouns: text('pronouns').notNull().default(''),
  location: text('location').notNull().default(''),
  avatarKey: text('avatar_key'),
  bannerKey: text('banner_key'),
  accentColor: text('accent_color'),
  links: jsonb('links').$type<ProfileLink[]>().notNull().default([]),
  favoriteGames: text('favorite_games').array().notNull().default([]),
  /** Short custom status, e.g. "Grinding ranked tonight". */
  status: text('status').notNull().default(''),
  /** IANA time zone; when set, the profile shows the person's local time. */
  timezone: text('timezone').notNull().default(''),
  languages: text('languages').array().notNull().default([]),
  platforms: text('platforms').array().notNull().default([]),
  playstyles: text('playstyles').array().notNull().default([]),
  lookingForGroup: boolean('looking_for_group').notNull().default(false),
  nowPlaying: text('now_playing'),
  /** Game and social accounts: kind (see ACCOUNT_KINDS) → handle. */
  accounts: jsonb('accounts').$type<Record<string, string>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').$type<Partial<Prefs>>().notNull().default({}),
  updatedAt: updatedAt(),
});

/** What someone has agreed to: the terms (and that they're 13+), and that they're 18+. */
export const userConsents = pgTable('user_consents', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The terms version they agreed to (0: none yet). */
  termsVersion: integer('terms_version').notNull().default(0),
  termsAcceptedAt: tz('terms_accepted_at'),
  /** When they said they're 18 or over (for communities marked 18+). */
  adultAt: tz('adult_at'),
});
