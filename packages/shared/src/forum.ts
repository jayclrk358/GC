import { z } from 'zod';
import { richDocSchema } from './richtext';
import { hexColor } from './theme';

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
});

export const channelInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('category'), name: z.string().trim().min(1).max(50) }),
  z.object({
    type: z.enum(['forum', 'text', 'announcement']),
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

/** Reactions available everywhere. Custom community emoji come later. */
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀'] as const;
export const REACTION_NAMES: Record<(typeof REACTIONS)[number], string> = {
  '👍': 'thumbs up',
  '❤️': 'heart',
  '😂': 'laughing',
  '🎉': 'party',
  '😮': 'surprised',
  '😢': 'sad',
  '🔥': 'fire',
  '👀': 'eyes',
};

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

/** Wiki URLs that belong to the app, so no page may take them as its slug. */
export const RESERVED_WIKI_SLUGS: ReadonlySet<string> = new Set([
  'new',
  'search',
  'all',
  'edit',
  'history',
]);

export const THREAD_SORTS = ['latest', 'new', 'top', 'hot', 'unanswered'] as const;
export type ThreadSort = (typeof THREAD_SORTS)[number];

/**
 * "Hot" ranking: score decays with age so active new threads rise (log-scaled votes plus a time
 * bonus, similar in spirit to classic link aggregators). Pure so it can be tested.
 */
export function hotScore(
  score: number,
  replies: number,
  createdAt: Date,
  epoch = Date.UTC(2025, 0, 1),
): number {
  const activity = score + replies * 0.5;
  const order = Math.log10(Math.max(Math.abs(activity), 1));
  const sign = activity > 0 ? 1 : activity < 0 ? -1 : 0;
  const seconds = (createdAt.getTime() - epoch) / 1000;
  return Math.round((sign * order + seconds / 45000) * 1e7) / 1e7;
}

export const MUTE_DURATIONS = {
  '1h': 3600,
  '8h': 8 * 3600,
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600,
  forever: 0,
} as const;

export const BAN_DURATIONS = {
  '1h': 3600,
  '1d': 86400,
  '7d': 7 * 86400,
  '30d': 30 * 86400,
  permanent: 0,
} as const;
export const TIMEOUT_DURATIONS = {
  '60s': 60,
  '5m': 300,
  '10m': 600,
  '1h': 3600,
  '1d': 86400,
  '7d': 7 * 86400,
} as const;

export function slugifyTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}
