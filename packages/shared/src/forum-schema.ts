import { z } from 'zod';
import { richDocSchema } from './richtext-schema';
import { hexColor } from './theme';

// Input validation for forum, wiki and reports (constants and helpers are in forum.ts).

/** Channel names double as URL segments: lowercase words joined by dashes. */
export const channelNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/\s+/g, '-'))
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$|^[a-z0-9]$/, 'Use letters, numbers and dashes'),
  );

export const channelSettingsSchema = z.object({
  voting: z.boolean().default(false),
  qa: z.boolean().default(false),
  requireFlair: z.boolean().default(false),
  defaultSort: z.enum(['latest', 'new', 'top', 'hot', 'unanswered']).default('latest'),
  emoji: z.string().max(8).default(''),
  backgroundKey: z
    .string()
    .regex(/^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/)
    .nullable()
    .default(null),
  backgroundDim: z.number().int().min(0).max(95).default(70),
});

export const channelInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('category'), name: z.string().trim().min(1).max(50) }),
  // A separator's name is its label (it may be blank: just a line).
  z.object({
    type: z.literal('separator'),
    name: z.string().trim().max(40).default(''),
    parentId: z.string().uuid().nullable().default(null),
  }),
  z.object({
    type: z.enum(['forum', 'text', 'announcement', 'voice']),
    name: channelNameSchema,
    topic: z.string().trim().max(300).default(''),
    parentId: z.string().uuid().nullable().default(null),
    settings: channelSettingsSchema.default(channelSettingsSchema.parse({})),
    slowmodeSeconds: z.number().int().min(0).max(21600).default(0),
  }),
]);
export type ChannelFormInput = z.infer<typeof channelInputSchema>;

export const flairInputSchema = z.object({
  name: z.string().trim().min(1).max(30),
  color: hexColor.nullable().default(null),
  channelId: z.string().uuid().nullable().default(null),
  modOnly: z.boolean().default(false),
});

export const pollInputSchema = z.object({
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
  multiple: z.boolean().default(false),
  closesInHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
});

export const threadInputSchema = z.object({
  channelId: z.string().uuid(),
  title: z.string().trim().min(3, 'At least 3 characters').max(200),
  body: richDocSchema,
  flairId: z.string().uuid().nullable().default(null),
  poll: pollInputSchema.nullable().default(null),
});
export type ThreadInput = z.infer<typeof threadInputSchema>;

export const postInputSchema = z.object({
  body: richDocSchema,
  replyToId: z.string().uuid().nullable().default(null),
});

export const reportInputSchema = z.object({
  targetType: z.enum(['post', 'thread', 'user', 'wiki_page', 'message']),
  targetId: z.string().min(1).max(64),
  reason: z.enum(['spam', 'harassment', 'hate', 'nsfw', 'violence', 'misinformation', 'other']),
  details: z.string().trim().max(1000).default(''),
});

export const wikiPageInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: richDocSchema,
  summary: z.string().trim().max(200).default(''),
  parentId: z.string().uuid().nullable().default(null),
  /** The revision the editor started from; saving on top of a newer one is refused. */
  baseRevisionId: z.string().uuid().nullable().optional(),
});
