import { z } from 'zod';
import {
  COMMUNITY_TEMPLATES,
  isPlayUrl,
  JOIN_MODES,
  LANGUAGES,
  REGIONS,
  VISIBILITY,
} from './community';
import { isValidSlug } from './slug';

// Input validation for communities, roles and invites (constants are in community.ts).

export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9 +#-]{0,23}$/, 'Tags use letters, numbers, spaces and dashes');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidSlug, 'Use 3–32 lowercase letters, numbers or dashes (and not a reserved word)');

/** An optional https link where people can play; blank clears it. */
export const playUrlSchema = z
  .string()
  .trim()
  .max(300)
  .transform((v) => v || null)
  .refine((v) => v === null || isPlayUrl(v), 'Use a link that starts with https://')
  .nullable();

export const communityBasicsSchema = z.object({
  name: z.string().trim().min(3, 'At least 3 characters').max(60),
  slug: slugSchema,
  tagline: z.string().trim().max(140).default(''),
  gameId: z.string().max(64).nullable().default(null),
  playUrl: playUrlSchema.default(null),
  tags: z.array(tagSchema).max(8).default([]),
  region: z.enum(REGIONS).default('global'),
  language: z.enum(LANGUAGES).default('en'),
  visibility: z.enum(VISIBILITY).default('public'),
  joinMode: z.enum(JOIN_MODES).default('open'),
  nsfw: z.boolean().default(false),
});
export type CommunityBasics = z.infer<typeof communityBasicsSchema>;

export const createCommunitySchema = communityBasicsSchema.extend({
  template: z.enum(COMMUNITY_TEMPLATES).default('fanhub'),
  preset: z.string().max(32).default('magnox'),
});
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

export const roleInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .default(null),
  icon: z.string().max(40).nullable().default(null),
  permissions: z.string().regex(/^\d{1,20}$/),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
  selfAssignable: z.boolean().default(false),
});
export type RoleInput = z.infer<typeof roleInputSchema>;

export const inviteInputSchema = z.object({
  maxUses: z.number().int().min(0).max(10000).default(0),
  expiresInHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 30)
    .default(24 * 7),
});
