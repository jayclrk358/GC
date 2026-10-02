/**
 * Rich text is stored as ProseMirror/Tiptap JSON. Only the node and mark types below are
 * accepted; everything is re-validated on the server and rendered through an allowlist, so
 * user content never reaches the DOM as raw HTML.
 */

const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/))/i;

export function isSafeHref(href: string): boolean {
  if (!SAFE_URL.test(href) || href.length > 2048 || /[\s<>"'\p{Cc}]/u.test(href)) return false;
  // Browsers read `\` as `/`, so a "relative" `/\evil.com` is really `//evil.com`: another site.
  return !href.startsWith('/') || !href.includes('\\');
}

/** Formatting on a run of text. Checked by the sanitizer in richtext-schema.ts. */
export type RichMark =
  | { type: 'bold' | 'italic' | 'strike' | 'code' | 'spoiler' }
  | { type: 'link'; attrs: { href: string } };

export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: RichMark[];
  text?: string;
}

/** Block-level node types (paragraphs, lists…); everything else is inline. */
export const RICH_BLOCK_NODES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
]);
export function emptyDoc(): RichNode {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function docFromText(text: string): RichNode {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  return {
    type: 'doc',
    content: paragraphs.length
      ? paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
      : [{ type: 'paragraph' }],
  };
}

/** Plain text for search indexing, previews and notifications. */
export function docToText(node: RichNode | null | undefined, limit = 100_000): string {
  if (!node) return '';
  const parts: string[] = [];
  const walk = (n: RichNode) => {
    if (parts.join('').length > limit) return;
    if (n.type === 'text' && n.text) parts.push(n.text);
    else if (n.type === 'hardBreak') parts.push('\n');
    else if (n.type === 'mention') parts.push(`@${String(n.attrs?.label ?? '')}`);
    else if (n.type === 'emoji') parts.push(`:${String(n.attrs?.name ?? '')}:`);
    else if (n.type === 'image' && n.attrs?.alt) parts.push(`[${String(n.attrs.alt)}]`);
    n.content?.forEach(walk);
    if (RICH_BLOCK_NODES.has(n.type)) parts.push('\n');
  };
  walk(node);
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);
}

/** Collect images missing alt text so the editor can prompt for them. */
export function imagesMissingAlt(node: RichNode): number {
  let missing = 0;
  const walk = (n: RichNode) => {
    if (n.type === 'image' && !String(n.attrs?.alt ?? '').trim()) missing++;
    n.content?.forEach(walk);
  };
  walk(node);
  return missing;
}

export function collectMentions(node: RichNode): { kind: string; id: string }[] {
  const out: { kind: string; id: string }[] = [];
  const walk = (n: RichNode) => {
    if (n.type === 'mention' && n.attrs?.id) {
      out.push({ kind: String(n.attrs.kind ?? 'user'), id: String(n.attrs.id) });
    }
    n.content?.forEach(walk);
  };
  walk(node);
  return out;
}

export interface DocHeading {
  level: number;
  text: string;
  /** Stable, unique anchor id (`h-` prefix keeps it clear of app ids). */
  id: string;
}

/** The document's headings in order, with unique anchor ids for a table of contents. */
export function docHeadings(node: RichNode | null | undefined): DocHeading[] {
  if (!node) return [];
  const out: DocHeading[] = [];
  const seen = new Map<string, number>();
  const walk = (n: RichNode) => {
    if (n.type === 'heading') {
      const text = docToText(n, 200).replace(/\s+/g, ' ').trim();
      const base =
        'h-' +
        (text
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 50) || 'section');
      const k = seen.get(base) ?? 0;
      seen.set(base, k + 1);
      out.push({ level: Number(n.attrs?.level ?? 2), text, id: k ? `${base}-${k + 1}` : base });
      return;
    }
    n.content?.forEach(walk);
  };
  walk(node);
  return out;
}
