/**
 * Profile details shared by the settings form, the service and the public profile page. Kept free
 * of zod so the profile page stays light; validation lives in core's profile service.
 */

export const PLATFORMS = ['pc', 'playstation', 'xbox', 'switch', 'mobile', 'vr'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLAYSTYLES = [
  'casual',
  'competitive',
  'roleplay',
  'building',
  'exploring',
  'pvp',
  'pve',
  'speedrunning',
  'completionist',
  'social',
  'creative',
  'streaming',
] as const;
export type Playstyle = (typeof PLAYSTYLES)[number];

export const MAX_PLAYSTYLES = 5;
export const MAX_PROFILE_LANGUAGES = 5;

export interface AccountKind {
  /** Stored key. */
  key: string;
  /** Brand name, shown as the label (not translated). */
  label: string;
  /** What a valid handle looks like. */
  pattern: RegExp;
  /** Example shown as a placeholder. */
  example: string;
  /** Public profile URL for a handle, when the service has one. */
  url?: (handle: string) => string;
}

const at = (h: string) => h.replace(/^@/, '');

export const ACCOUNT_KINDS: readonly AccountKind[] = [
  {
    key: 'discord',
    label: 'Discord',
    pattern: /^(?:[a-z0-9_.]{2,32}|[^#@:]{2,32}#\d{4})$/,
    example: 'username',
  },
  {
    key: 'steam',
    label: 'Steam',
    pattern: /^(?:7656\d{13}|[A-Za-z0-9_-]{2,32})$/,
    example: 'custom-url-or-id',
    url: (h) =>
      /^7656\d{13}$/.test(h)
        ? `https://steamcommunity.com/profiles/${h}`
        : `https://steamcommunity.com/id/${encodeURIComponent(h)}`,
  },
  { key: 'xbox', label: 'Xbox', pattern: /^[A-Za-z0-9 #]{1,16}$/, example: 'Gamertag' },
  {
    key: 'playstation',
    label: 'PlayStation',
    pattern: /^[A-Za-z][A-Za-z0-9_-]{2,15}$/,
    example: 'Online-ID',
  },
  {
    key: 'nintendo',
    label: 'Nintendo Switch',
    pattern: /^SW-\d{4}-\d{4}-\d{4}$/,
    example: 'SW-1234-5678-9012',
  },
  {
    key: 'roblox',
    label: 'Roblox',
    pattern: /^[A-Za-z0-9_]{3,20}$/,
    example: 'Username',
    url: (h) => `https://www.roblox.com/users/profile?username=${encodeURIComponent(h)}`,
  },
  { key: 'epic', label: 'Epic Games', pattern: /^[\w.\- ]{3,16}$/u, example: 'DisplayName' },
  {
    key: 'battlenet',
    label: 'Battle.net',
    pattern: /^[\p{L}][\p{L}\p{N}]{2,11}#\d{4,5}$/u,
    example: 'Name#1234',
  },
  { key: 'minecraft', label: 'Minecraft', pattern: /^[A-Za-z0-9_]{3,16}$/, example: 'Steve' },
  {
    key: 'twitch',
    label: 'Twitch',
    pattern: /^[A-Za-z0-9_]{4,25}$/,
    example: 'channel',
    url: (h) => `https://www.twitch.tv/${h}`,
  },
  {
    key: 'youtube',
    label: 'YouTube',
    pattern: /^@?[A-Za-z0-9._-]{3,30}$/,
    example: '@handle',
    url: (h) => `https://www.youtube.com/@${at(h)}`,
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    pattern: /^@?[A-Za-z0-9_]{1,15}$/,
    example: '@handle',
    url: (h) => `https://x.com/${at(h)}`,
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    pattern: /^@?[A-Za-z0-9._]{2,24}$/,
    example: '@handle',
    url: (h) => `https://www.tiktok.com/@${at(h)}`,
  },
];

export const ACCOUNT_KEYS = ACCOUNT_KINDS.map((k) => k.key);

/** Tidy a handle as typed: trims, and upper-cases a Switch friend code. */
export function normaliseHandle(key: string, raw: string): string {
  const v = raw.trim();
  if (key === 'nintendo') {
    const digits = v.replace(/\D/g, '');
    return digits.length === 12
      ? `SW-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`
      : v.toUpperCase();
  }
  return v;
}

/** Whether a string is a time zone this runtime knows (e.g. "Europe/London"). */
export function isTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
