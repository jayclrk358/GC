import { z } from 'zod';
import { richDocSchema, emptyDoc } from './richtext';
import { uploadKey } from './theme';

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https:\/\//i.test(u), 'Links must start with https://');

const heading = z.string().trim().max(80);

export const LINK_KINDS = [
  'website',
  'discord',
  'steam',
  'youtube',
  'twitch',
  'x',
  'bluesky',
  'reddit',
  'github',
  'tiktok',
  'instagram',
  'patreon',
  'store',
  'other',
] as const;

export const blockConfigSchemas = {
  hero: z.object({
    heading: z.string().trim().min(1).max(120),
    subheading: z.string().trim().max(300).default(''),
    ctaLabel: z.string().trim().max(40).default(''),
    ctaTarget: z.enum(['join', 'forum', 'chat', 'servers', 'events', 'url']).default('join'),
    ctaUrl: httpsUrl.optional(),
    align: z.enum(['start', 'center']).default('start'),
  }),
  about: z.object({ heading: heading.default('About'), doc: richDocSchema.default(emptyDoc) }),
  richText: z.object({ heading: heading.default(''), doc: richDocSchema.default(emptyDoc) }),
  rules: z.object({
    heading: heading.default('Rules'),
    rules: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(120),
          description: z.string().trim().max(1000).default(''),
        }),
      )
      .max(50)
      .default([]),
  }),
  links: z.object({
    heading: heading.default('Links'),
    links: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(60),
          url: httpsUrl,
          kind: z.enum(LINK_KINDS).default('website'),
        }),
      )
      .max(24)
      .default([]),
  }),
  faq: z.object({
    heading: heading.default('FAQ'),
    items: z
      .array(
        z.object({
          q: z.string().trim().min(1).max(200),
          a: z.string().trim().min(1).max(2000),
        }),
      )
      .max(40)
      .default([]),
  }),
  gallery: z.object({
    heading: heading.default('Gallery'),
    layout: z.enum(['grid', 'masonry']).default('grid'),
    images: z
      .array(
        z.object({
          key: uploadKey,
          alt: z.string().trim().max(500),
          caption: z.string().trim().max(200).default(''),
        }),
      )
      .max(24)
      .default([]),
  }),
  staff: z.object({
    heading: heading.default('Staff'),
    roleIds: z.array(z.string().uuid()).max(10).default([]),
  }),
  discordInvite: z.object({
    heading: heading.default('Join us on Discord'),
    code: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9-]{2,32}$/, 'Enter just the invite code, e.g. "abc123"'),
    description: z.string().trim().max(200).default(''),
  }),
  embed: z.object({
    heading: heading.default(''),
    provider: z.enum(['youtube', 'twitch']),
    /** YouTube video id or Twitch channel name. */
    ref: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{2,64}$/, 'Invalid video id or channel'),
    title: z.string().trim().min(1, 'A title is required for screen readers').max(120),
  }),
  serverStatus: z.object({
    heading: heading.default('Our servers'),
    serverIds: z.array(z.string().uuid()).max(8).default([]),
    showPlayers: z.boolean().default(true),
    layout: z.enum(['cards', 'list']).default('cards'),
  }),
  featuredThreads: z.object({
    heading: heading.default('Latest discussions'),
    channelId: z.string().uuid().optional(),
    count: z.number().int().min(1).max(10).default(5),
  }),
  upcomingEvents: z.object({
    heading: heading.default('Upcoming events'),
    count: z.number().int().min(1).max(10).default(3),
  }),
  stats: z.object({
    heading: heading.default(''),
    showMembers: z.boolean().default(true),
    showOnline: z.boolean().default(true),
    showThreads: z.boolean().default(true),
    showServers: z.boolean().default(true),
  }),
} as const;

export type BlockType = keyof typeof blockConfigSchemas;
export const BLOCK_TYPES = Object.keys(blockConfigSchemas) as BlockType[];

export type BlockConfig<T extends BlockType> = z.infer<(typeof blockConfigSchemas)[T]>;

export type Block = {
  [T in BlockType]: { id: string; type: T; visible: boolean; config: BlockConfig<T> };
}[BlockType];

export function parseBlockConfig<T extends BlockType>(type: T, config: unknown): BlockConfig<T> {
  return blockConfigSchemas[type].parse(config) as BlockConfig<T>;
}

export function defaultBlockConfig<T extends BlockType>(type: T): BlockConfig<T> {
  const defaults: { [K in BlockType]?: unknown } = {
    hero: { heading: 'Welcome' },
    discordInvite: { code: 'invite' },
    embed: { provider: 'youtube', ref: 'dQw4w9WgXcQ', title: 'Featured video' },
  };
  return parseBlockConfig(type, defaults[type] ?? {});
}

/** Tabs a community can show. The order and labels are customisable. */
export const NAV_TABS = ['home', 'forum', 'chat', 'wiki', 'events', 'servers', 'members'] as const;
export type NavTab = (typeof NAV_TABS)[number];

export const navSchema = z
  .array(
    z.object({
      tab: z.enum(NAV_TABS),
      label: z.string().trim().max(24).default(''),
      visible: z.boolean().default(true),
    }),
  )
  .max(NAV_TABS.length)
  .refine((items) => new Set(items.map((i) => i.tab)).size === items.length, 'Duplicate tab')
  .refine((items) => items.some((i) => i.tab === 'home' && i.visible), 'Home must stay visible');

export type NavConfig = z.infer<typeof navSchema>;

export const DEFAULT_NAV: NavConfig = NAV_TABS.map((tab) => ({ tab, label: '', visible: true }));

/** Merge a stored nav config with any tabs added since it was saved. */
export function normalizeNav(stored: unknown): NavConfig {
  const parsed = navSchema.safeParse(stored);
  const items = parsed.success ? parsed.data : DEFAULT_NAV;
  const present = new Set(items.map((i) => i.tab));
  return [...items, ...DEFAULT_NAV.filter((d) => !present.has(d.tab))];
}
