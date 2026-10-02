import { z } from 'zod';

// Automod: rules a community sets to stop unwanted posts before anyone sees them.

/** "block" refuses the post; "hold" keeps it back for a moderator to approve or reject. */
export const AUTOMOD_ACTIONS = ['block', 'hold'] as const;
export type AutomodAction = (typeof AUTOMOD_ACTIONS)[number];

const action = z.enum(AUTOMOD_ACTIONS);

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) =>
    d
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[/?#].*$/, ''),
  )
  .pipe(
    z
      .string()
      .min(3)
      .max(253)
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Use a domain like example.com.'),
  );

export const automodSchema = z.object({
  words: z
    .object({
      enabled: z.boolean().default(false),
      /** Words or phrases; a * at the start or end matches any word that ends or starts with it. */
      list: z
        .array(z.string().trim().toLowerCase().min(1).max(60))
        .max(500, 'Up to 500 words.')
        .default([]),
      action: action.default('block'),
    })
    .prefault({}),
  links: z
    .object({
      enabled: z.boolean().default(false),
      /** Sites that are always fine (subdomains included). Everything else is caught. */
      allow: z.array(domainSchema).max(100).default([]),
      action: action.default('block'),
    })
    .prefault({}),
  invites: z
    .object({
      /** Invite links to other servers and groups (Discord, Guilded, Telegram, WhatsApp). */
      enabled: z.boolean().default(false),
      action: action.default('block'),
    })
    .prefault({}),
  spam: z
    .object({
      enabled: z.boolean().default(false),
      /** Most people (and roles) one post can mention. */
      maxMentions: z.number().int().min(1).max(50).default(5),
      /** Most messages someone can send in ten seconds. */
      maxPerTenSeconds: z.number().int().min(2).max(30).default(5),
      /** Stop the same message being sent three times in a minute. */
      duplicates: z.boolean().default(true),
      /** Time out whoever trips the flood limit, in minutes (0: just stop the message). */
      timeoutMinutes: z.number().int().min(0).max(1440).default(0),
    })
    .prefault({}),
  newMembers: z
    .object({
      enabled: z.boolean().default(false),
      /** How old an account has to be. */
      minAccountAgeHours: z.number().int().min(0).max(720).default(24),
      /** How long someone has to have been a member. */
      minMemberMinutes: z.number().int().min(0).max(10080).default(10),
      action: action.default('hold'),
    })
    .prefault({}),
  joins: z
    .object({
      /** Pause joining when lots of people join at once (a raid). */
      enabled: z.boolean().default(false),
      maxPerMinute: z.number().int().min(2).max(500).default(10),
      pauseMinutes: z.number().int().min(5).max(240).default(15),
    })
    .prefault({}),
  /** Roles automod leaves alone (moderators always are). */
  exemptRoleIds: z.array(z.string().uuid()).max(50).default([]),
});
export type AutomodConfig = z.infer<typeof automodSchema>;

export const DEFAULT_AUTOMOD: AutomodConfig = automodSchema.parse({});

export type AutomodRule = 'words' | 'links' | 'invites' | 'mentions' | 'newMember';

export interface AutomodHit {
  rule: AutomodRule;
  action: AutomodAction;
  /** What matched, for moderators (a word or a link). */
  match?: string;
}

/** Why a post was stopped, as the author sees it. */
export function automodMessage(hit: AutomodHit, outcome: 'block' | 'hold' | 'edit'): string {
  const why: Record<AutomodRule, string> = {
    words: 'it has a word this community doesn’t allow',
    links: 'links to that site aren’t allowed here',
    invites: 'invite links to other groups aren’t allowed here',
    mentions: 'it mentions too many people at once',
    newMember: 'new members’ posts are checked first here',
  };
  if (outcome === 'hold')
    return `A moderator will look at your post before it appears: ${why[hit.rule]}.`;
  if (outcome === 'edit') return `Your changes weren’t saved: ${why[hit.rule]}.`;
  return `Your post wasn’t sent: ${why[hit.rule]}.`;
}

// ── Matching words ──────────────────────────────────────────────────────────

/** Digits that stand in for letters ("fr33"). Digits are part of words anyway. */
const LEET_DIGITS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
};
/**
 * Symbols that stand in for letters ("sh!t", "$cam"), read as letters only when a letter follows,
 * so "scam!" still ends the word.
 */
const LEET_SYMBOLS: Record<string, string> = { '@': 'a', $: 's', '!': 'i' };

/** Characters that don't show (zero-width spaces and joiners), used to split words unseen. */
const INVISIBLE = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x00ad]);

/** Part of a word: ASCII letters and digits, and letters from other alphabets. */
function isWordChar(cp: number): boolean {
  if (cp < 128) {
    return (cp >= 97 && cp <= 122) || (cp >= 48 && cp <= 57);
  }
  // Punctuation, symbols and emoji count as gaps between words.
  if (cp <= 0xbf || cp === 0xd7 || cp === 0xf7) return false;
  if (cp >= 0x2000 && cp <= 0x2bff) return false;
  if (cp >= 0x3000 && cp <= 0x303f) return false;
  if (cp >= 0xfe10 && cp <= 0xfe6f) return false;
  if (cp >= 0xff00 && cp <= 0xff0f) return false;
  if (cp >= 0x1f000) return false;
  return true;
}

/**
 * Text as words for matching: lower case, accents and invisible characters gone, common
 * look-alike digits and symbols read as letters, and every gap a single space (with one at each
 * end, so " word " finds whole words).
 */
export function normalizeForMatch(text: string): string {
  // Invisible characters and combining accents (é is e plus an accent after NFKD) go first.
  const chars = [...text.normalize('NFKD').toLowerCase()].filter((ch) => {
    const cp = ch.codePointAt(0)!;
    return !INVISIBLE.has(cp) && !(cp >= 0x300 && cp <= 0x36f);
  });
  let out = ' ';
  chars.forEach((ch, i) => {
    const next = chars[i + 1];
    const symbol = LEET_SYMBOLS[ch];
    const mapped =
      LEET_DIGITS[ch] ??
      (symbol && next && isWordChar((LEET_DIGITS[next] ?? next).codePointAt(0)!) ? symbol : ch);
    if (isWordChar(mapped.codePointAt(0)!)) out += mapped;
    else if (!out.endsWith(' ')) out += ' ';
  });
  return out.endsWith(' ') ? out : `${out} `;
}

/** Scripts written without spaces, where a word can only be found inside other text. */
const NO_SPACES = /[⺀-鿿豈-﫿฀-๿]/;

/** The first listed word or phrase found in some text. */
export function findBlockedWord(text: string, list: readonly string[]): string | null {
  if (!list.length) return null;
  const hay = normalizeForMatch(text);
  for (const entry of list) {
    const starts = entry.startsWith('*');
    const ends = entry.endsWith('*');
    const core = normalizeForMatch(entry.replace(/^\*+|\*+$/g, '')).trim();
    if (!core) continue;
    const found = NO_SPACES.test(core)
      ? hay.includes(core)
      : starts && ends
        ? hay.includes(core)
        : starts
          ? hay.includes(`${core} `)
          : ends
            ? hay.includes(` ${core}`)
            : hay.includes(` ${core} `);
    if (found) return entry;
  }
  return null;
}

// ── Links ───────────────────────────────────────────────────────────────────

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
// Bare domains ("free-nitro.gift"), with the endings spam tends to use. At most eight labels
// before the ending: unbounded, text like "x.x.x.x…" took time growing with the square of its
// length (seconds for one long post). A longer name is still found, from a later label.
const BARE_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,8}(?:com|net|org|gg|io|co|xyz|ru|me|tv|app|dev|link|ly|to|info|biz|site|online|shop|club|top|live|store|us|uk|de|fr|eu|cc|ws|su|tk|ml|ga|cf|gq|pw|gift|click|fun|icu|cn|ai|vip|win|lol)\b(?:\/[^\s<>"'`]*)?/gi;

/** The host of a link, without "www.", or null if it doesn't look like one. */
export function linkHost(link: string): string | null {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(link) ? link : `http://${link}`);
    return url.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Links in some text (with or without http://), plus any given separately (e.g. link marks). */
export function findLinks(text: string, extra: readonly string[] = []): string[] {
  const out = new Set<string>(extra);
  for (const m of text.matchAll(URL_RE)) out.add(m[0]);
  // Bare domains, skipping ones that are part of a full link already found or an email address.
  const withoutUrls = text.replace(URL_RE, ' ');
  for (const m of withoutUrls.matchAll(BARE_RE)) {
    const before = withoutUrls[m.index - 1];
    if (before === '@') continue;
    out.add(m[0]);
  }
  return [...out].slice(0, 50);
}

export function hostAllowed(host: string, allow: readonly string[]): boolean {
  return allow.some((d) => host === d || host.endsWith(`.${d}`));
}

const INVITE_RE =
  /(?:discord(?:app)?\.com\/invite|discord\.(?:gg|io|me|li)|guilded\.gg\/i|t\.me\/(?:joinchat\/|\+)|telegram\.me\/joinchat|chat\.whatsapp\.com)\/?[a-z0-9_-]+/i;

export function hasInviteLink(text: string, links: readonly string[] = []): boolean {
  return INVITE_RE.test(text) || links.some((l) => INVITE_RE.test(l));
}

// ── Checking a post ─────────────────────────────────────────────────────────

export interface AutomodContent {
  text: string;
  /** Links the editor marked up, besides those written out in the text. */
  links?: readonly string[];
  /** People, roles and @everyone mentioned. */
  mentions?: number;
}

/**
 * The first rule some content breaks, checking only the content itself (not who wrote it or how
 * often). Invites are checked before other links so the reason is the more specific one.
 */
export function scanContent(config: AutomodConfig, content: AutomodContent): AutomodHit | null {
  const { text } = content;
  if (config.words.enabled) {
    const word = findBlockedWord(text, config.words.list);
    if (word) return { rule: 'words', action: config.words.action, match: word };
  }
  const links =
    config.invites.enabled || config.links.enabled ? findLinks(text, content.links) : [];
  if (config.invites.enabled && hasInviteLink(text, links)) {
    return {
      rule: 'invites',
      action: config.invites.action,
      match: links.find((l) => INVITE_RE.test(l)),
    };
  }
  if (config.links.enabled) {
    for (const link of links) {
      const host = linkHost(link);
      if (host && !hostAllowed(host, config.links.allow)) {
        return { rule: 'links', action: config.links.action, match: host };
      }
    }
  }
  if (config.spam.enabled && (content.mentions ?? 0) > config.spam.maxMentions) {
    return { rule: 'mentions', action: 'block' };
  }
  return null;
}
