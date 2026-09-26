import { z } from 'zod';

/**
 * Rich text is stored as ProseMirror/Tiptap JSON. Only the node and mark types below are
 * accepted; everything is re-validated on the server and rendered through an allowlist, so
 * user content never reaches the DOM as raw HTML.
 */

const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/))/i;

export function isSafeHref(href: string): boolean {
  return SAFE_URL.test(href) && href.length <= 2048 && !/[\s<>"']/.test(href);
}

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('strike') }),
  z.object({ type: z.literal('code') }),
  z.object({ type: z.literal('spoiler') }),
  z.object({
    type: z.literal('link'),
    attrs: z.object({ href: z.string().refine(isSafeHref, 'Unsafe link') }),
  }),
]);
export type RichMark = z.infer<typeof markSchema>;

export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: RichMark[];
  text?: string;
}

const BLOCK_TYPES = new Set([
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
const INLINE_TYPES = new Set(['text', 'hardBreak', 'mention', 'emoji']);

const attrValidators: Record<string, z.ZodType> = {
  heading: z.object({ level: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
  orderedList: z.object({ start: z.number().int().min(0).max(10000).optional() }),
  codeBlock: z.object({
    language: z
      .string()
      .regex(/^[a-z0-9+#-]{0,20}$/)
      .nullable()
      .optional(),
  }),
  image: z.object({
    src: z.string().regex(/^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/),
    alt: z.string().max(1000).default(''),
    title: z.string().max(200).nullable().optional(),
  }),
  mention: z.object({
    id: z.string().max(64),
    label: z.string().max(64).optional(),
    kind: z.enum(['user', 'role', 'everyone', 'channel']).default('user'),
  }),
  emoji: z.object({
    name: z.string().regex(/^[a-z0-9_]{1,32}$/),
    id: z.string().max(64).optional(),
  }),
};

export class RichTextError extends Error {}

const MAX_DEPTH = 12;
const MAX_NODES = 5000;

/** Validate and normalise a document. Throws RichTextError when invalid. */
export function sanitizeDoc(input: unknown): RichNode {
  let count = 0;
  const visit = (raw: unknown, depth: number): RichNode => {
    if (++count > MAX_NODES) throw new RichTextError('Document is too large');
    if (depth > MAX_DEPTH) throw new RichTextError('Document is nested too deeply');
    if (!raw || typeof raw !== 'object') throw new RichTextError('Invalid node');
    const node = raw as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== 'string') throw new RichTextError('Node without type');
    if (depth === 0 && type !== 'doc') throw new RichTextError('Root must be a doc');
    if (depth > 0 && !BLOCK_TYPES.has(type) && !INLINE_TYPES.has(type)) {
      throw new RichTextError(`Unsupported node: ${type.slice(0, 20)}`);
    }
    const out: RichNode = { type };
    if (type === 'text') {
      if (typeof node.text !== 'string' || node.text.length === 0) {
        throw new RichTextError('Invalid text node');
      }
      out.text = node.text.slice(0, 20000);
      if (Array.isArray(node.marks) && node.marks.length > 0) {
        out.marks = node.marks.slice(0, 8).map((m) => {
          const r = markSchema.safeParse(m);
          if (!r.success) throw new RichTextError('Invalid mark');
          return r.data;
        });
      }
      return out;
    }
    const validator = attrValidators[type];
    if (validator) {
      const r = validator.safeParse(node.attrs ?? {});
      if (!r.success) throw new RichTextError(`Invalid attributes for ${type}`);
      out.attrs = r.data as Record<string, unknown>;
    }
    if (Array.isArray(node.content)) {
      out.content = node.content.map((c) => visit(c, depth + 1));
    }
    return out;
  };
  return visit(input, 0);
}

export const richDocSchema = z.custom<RichNode>((v) => {
  try {
    sanitizeDoc(v);
    return true;
  } catch {
    return false;
  }
}, 'Invalid rich text');

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
    if (BLOCK_TYPES.has(n.type)) parts.push('\n');
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
