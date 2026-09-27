import type { RichNode } from './richtext';
import { REACTIONS, REACTION_NAMES } from './forum';

export const MAX_ATTACHMENTS = 4;

/** Video attachments are MP4 or WebM uploads, stored as uploaded (see core's video.ts). */
export const VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
export const MAX_VIDEO_BYTES = 50_000_000;

export function isVideoKey(key: string): boolean {
  return /\.(mp4|webm)$/.test(key);
}

export const MAX_MESSAGE_CHARS = 4000;

/** Reactions offered in chat: the forum set plus a few chat staples. */
export const CHAT_REACTIONS = [
  ...REACTIONS,
  '✅',
  '❌',
  '💯',
  '🙏',
  '👋',
  '🤔',
  '👏',
  '😎',
] as const;
export const CHAT_REACTION_NAMES: Record<string, string> = {
  ...REACTION_NAMES,
  '✅': 'check mark',
  '❌': 'cross mark',
  '💯': 'hundred points',
  '🙏': 'thank you',
  '👋': 'wave',
  '🤔': 'thinking',
  '👏': 'clapping',
  '😎': 'cool',
};

export function isChatReaction(emoji: string): boolean {
  return (CHAT_REACTIONS as readonly string[]).includes(emoji);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

function trimUrl(url: string): string {
  // Drop trailing punctuation that is almost never part of the link.
  let u = url.replace(/[.,;:!?]+$/, '');
  if (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0))
    u = u.slice(0, -1);
  return u;
}

/**
 * Up to `max` distinct http(s) links in a message, in order: link marks and bare URLs in
 * text. Text inside inline code or code blocks is ignored (people paste URLs there on purpose).
 */
export function extractLinks(doc: RichNode, max = 3): string[] {
  const out: string[] = [];
  const add = (u: string) => {
    const url = trimUrl(u);
    if (!/^https?:\/\//i.test(url) || url.length > 2048) return;
    if (!out.includes(url)) out.push(url);
  };
  const walk = (n: RichNode) => {
    if (out.length >= max) return;
    if (n.type === 'codeBlock') return;
    if (n.type === 'text') {
      if (n.marks?.some((m) => m.type === 'code')) return;
      const link = n.marks?.find((m) => m.type === 'link');
      if (link && link.type === 'link') add(link.attrs.href);
      else for (const m of n.text?.match(URL_RE) ?? []) add(m);
      return;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out.slice(0, max);
}

export interface MentionTarget {
  mentionUserIds: string[];
  mentionRoleIds: string[];
  mentionEveryone: boolean;
}

/** Does a message mention this person (directly, through a role, or @everyone)? */
export function mentionsMe(
  msg: MentionTarget,
  userId: string | null,
  roleIds: readonly string[],
): boolean {
  if (!userId) return false;
  if (msg.mentionEveryone) return true;
  if (msg.mentionUserIds.includes(userId)) return true;
  return msg.mentionRoleIds.some((r) => roleIds.includes(r));
}

/** Consecutive messages from one author within this window share a header. */
export const GROUP_WINDOW_MS = 7 * 60 * 1000;

export function startsNewGroup(
  prev: { authorId: string | null; createdAt: string | Date } | undefined,
  cur: { authorId: string | null; createdAt: string | Date; replyToId: string | null },
): boolean {
  if (!prev || cur.replyToId) return true;
  if (!prev.authorId || prev.authorId !== cur.authorId) return true;
  const gap = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
  if (gap < 0 || gap > GROUP_WINDOW_MS) return true;
  return new Date(cur.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
}

export type ChatVerbosity = 'all' | 'mentions' | 'off';

export interface AnnounceItem {
  authorName: string;
  text: string;
  mentionsMe: boolean;
  own: boolean;
}

export type Announcement =
  | { kind: 'single'; authorName: string; text: string; mention: boolean }
  | { kind: 'many'; count: number; authors: string[]; mentions: number };

/**
 * What the screen-reader announcer should say for a burst of incoming messages, given the
 * reader's verbosity preference. Own messages are never announced. Returns null for silence.
 */
export function summariseForAnnouncement(
  items: AnnounceItem[],
  verbosity: ChatVerbosity,
): Announcement | null {
  if (verbosity === 'off') return null;
  const relevant = items.filter((i) => !i.own && (verbosity === 'all' || i.mentionsMe));
  if (!relevant.length) return null;
  if (relevant.length === 1) {
    const one = relevant[0]!;
    return {
      kind: 'single',
      authorName: one.authorName,
      text: one.text.slice(0, 280),
      mention: one.mentionsMe,
    };
  }
  const authors = [...new Set(relevant.map((i) => i.authorName))];
  return {
    kind: 'many',
    count: relevant.length,
    authors: authors.slice(0, 3),
    mentions: relevant.filter((i) => i.mentionsMe).length,
  };
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export interface OpenGraph {
  title: string;
  description: string;
  siteName: string;
  image: string | null;
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

const clean = (s: string, max: number) =>
  decodeEntities(s).replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Pull preview fields out of an HTML document's <head>: OpenGraph first, then Twitter cards,
 * then <title> and meta description. Only reads tags; never executes or renders anything.
 */
export function parseOpenGraph(html: string, pageUrl: string): OpenGraph | null {
  const head = html.slice(0, 300_000);
  const meta = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    const content = attr(tag, 'content');
    if (key && content !== null && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const title = clean(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 200);
  const description = clean(
    meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description') ?? '',
    400,
  );
  let siteName = clean(meta.get('og:site_name') ?? '', 100);
  if (!siteName) {
    try {
      siteName = new URL(pageUrl).hostname.replace(/^www\./, '');
    } catch {
      siteName = '';
    }
  }
  let image: string | null = null;
  const rawImage =
    meta.get('og:image:secure_url') ?? meta.get('og:image') ?? meta.get('twitter:image');
  if (rawImage) {
    try {
      const u = new URL(decodeEntities(rawImage.trim()), pageUrl);
      if (u.protocol === 'https:' || u.protocol === 'http:') image = u.toString();
    } catch {
      image = null;
    }
  }
  if (!title && !description) return null;
  return { title, description, siteName, image };
}

/**
 * Chat messages are lighter than posts: headings become paragraphs, and inline images and
 * dividers are dropped (images go in attachments, with alt text). Run after sanitizeDoc.
 */
export function toChatDoc(doc: RichNode): RichNode {
  const map = (n: RichNode): RichNode | null => {
    if (n.type === 'image' || n.type === 'horizontalRule') return null;
    const out: RichNode = n.type === 'heading' ? { type: 'paragraph' } : { ...n };
    if (n.type === 'heading') delete out.attrs;
    if (n.content) out.content = n.content.map(map).filter((c): c is RichNode => c !== null);
    return out;
  };
  const mapped = map(doc) ?? { type: 'doc', content: [] };
  // Trim empty paragraphs at the end (Enter-to-send can leave one behind).
  const content = [...(mapped.content ?? [])];
  while (
    content.length > 1 &&
    content.at(-1)?.type === 'paragraph' &&
    !content.at(-1)?.content?.length
  )
    content.pop();
  return { ...mapped, content };
}

export interface ParsedSearch {
  text: string;
  from: string | null;
  in: string | null;
}

/** Split `from:alice in:general text` into operators and free text. */
export function parseSearchQuery(q: string): ParsedSearch {
  let from: string | null = null;
  let channel: string | null = null;
  const text = q
    .replace(/\b(from|in):([@#]?[a-z0-9_.-]{1,40})/gi, (_m, op: string, value: string) => {
      if (op.toLowerCase() === 'from') from = value.replace(/^@/, '').toLowerCase();
      else channel = value.replace(/^#/, '').toLowerCase();
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, from, in: channel };
}
