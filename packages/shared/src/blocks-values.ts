import type { BlockType, NavConfig } from './blocks';

// Kept free of zod so the page builder stays small in the browser. The schemas in blocks.ts
// validate input; a unit test checks BLOCK_TYPES lists every block there, in the same order.

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

/** Every block type, in the order the page builder offers them. */
export const BLOCK_TYPES: BlockType[] = [
  'hero',
  'about',
  'richText',
  'rules',
  'links',
  'faq',
  'gallery',
  'staff',
  'discordInvite',
  'embed',
  'serverStatus',
  'featuredThreads',
  'upcomingEvents',
  'stats',
];

/** Tabs a community can show. The order and labels are customisable. */
export const NAV_TABS = ['home', 'forum', 'chat', 'wiki', 'events', 'servers', 'members'] as const;
export type NavTab = (typeof NAV_TABS)[number];

export const DEFAULT_NAV: NavConfig = NAV_TABS.map((tab) => ({ tab, label: '', visible: true }));
