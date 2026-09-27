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
