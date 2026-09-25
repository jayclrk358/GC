import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import type { Prefs } from '@magnox/shared';
import { users } from './auth';
import { updatedAt } from './_helpers';

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
  updatedAt: updatedAt(),
});

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').$type<Partial<Prefs>>().notNull().default({}),
  updatedAt: updatedAt(),
});
