export const VISIBILITY = ['public', 'unlisted', 'private'] as const;
export const JOIN_MODES = ['open', 'apply', 'invite'] as const;
export const COMMUNITY_TEMPLATES = ['server', 'clan', 'fanhub', 'creator'] as const;
export type CommunityTemplate = (typeof COMMUNITY_TEMPLATES)[number];

export const REGIONS = [
  'global',
  'na-east',
  'na-west',
  'south-america',
  'europe-west',
  'europe-east',
  'uk',
  'middle-east',
  'africa',
  'asia-east',
  'asia-southeast',
  'india',
  'oceania',
] as const;

export const LANGUAGES = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'nl',
  'pl',
  'ru',
  'uk',
  'tr',
  'ar',
  'hi',
  'ja',
  'ko',
  'zh',
  'sv',
  'no',
  'da',
  'fi',
  'cs',
  'other',
] as const;

export interface PlayLink {
  /** Where the Play button goes. */
  href: string;
  /** Recognised platform, for the button's label. */
  platform: 'roblox' | null;
  /** The site the link opens, shown to people before they leave. */
  host: string;
}

const ROBLOX_GAME_RE =
  /^https:\/\/(?:www\.|web\.)?roblox\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/(\d{1,20})(?:[/?#]|$)/i;

/** Only plain https links to real hosts are accepted as play links. */
export function isPlayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Turn a community's play link into the Play button's target. A Roblox experience page becomes
 * Roblox's launch link, which opens the game in the Roblox app (or offers to install it).
 */
export function playLink(url: string | null | undefined): PlayLink | null {
  if (!url || !isPlayUrl(url)) return null;
  const roblox = ROBLOX_GAME_RE.exec(url);
  if (roblox) {
    return {
      href: `https://www.roblox.com/games/start?placeId=${roblox[1]}`,
      platform: 'roblox',
      host: 'roblox.com',
    };
  }
  return { href: url, platform: null, host: new URL(url).hostname.replace(/^www\./, '') };
}
