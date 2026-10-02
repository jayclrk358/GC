import { z } from 'zod';
import { isSafeHref, RICH_BLOCK_NODES, type RichNode } from './richtext';

// Validation for rich text documents. Kept apart from richtext.ts so pages that only display or
// edit text don't ship zod to the browser.

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
    if (depth > 0 && !RICH_BLOCK_NODES.has(type) && !INLINE_TYPES.has(type)) {
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

/**
 * How many characters of text a document holds, counted in one pass (text, mention labels and
 * image descriptions). Stops once past `stopAt`, so a huge document costs no more than that.
 */
export function docTextLength(node: RichNode, stopAt = Number.POSITIVE_INFINITY): number {
  let total = 0;
  const stack: RichNode[] = [node];
  while (stack.length && total <= stopAt) {
    const n = stack.pop()!;
    if (n.type === 'text') total += n.text?.length ?? 0;
    else if (n.type === 'mention') total += 1 + String(n.attrs?.label ?? '').length;
    else if (n.type === 'emoji') total += 2 + String(n.attrs?.name ?? '').length;
    else if (n.type === 'image') total += String(n.attrs?.alt ?? '').length;
    if (n.content) for (const c of n.content) stack.push(c);
  }
  return total;
}

export interface DocLimits {
  /** Most characters of text. */
  maxChars: number;
  /** Most bytes the document takes stored (UTF-8 JSON). */
  maxBytes: number;
}

/** Forum posts (each edit keeps a revision too). */
export const POST_DOC_LIMITS: DocLimits = { maxChars: 40_000, maxBytes: 100_000 };
/** Wiki pages, which are longer by nature. */
export const WIKI_DOC_LIMITS: DocLimits = { maxChars: 100_000, maxBytes: 200_000 };

/**
 * Why a (sanitised) document is too big to keep, or null when it fits. Text is counted first so
 * an oversized document is turned away before it's serialised.
 */
export function docSizeProblem(doc: RichNode, limits: DocLimits): string | null {
  if (docTextLength(doc, limits.maxChars) > limits.maxChars) {
    return `That’s too long: keep it under ${limits.maxChars.toLocaleString('en')} characters.`;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(doc)).byteLength;
  if (bytes > limits.maxBytes) return 'That’s too long to save. Shorten it or split it up.';
  return null;
}

export const richDocSchema = z.custom<RichNode>((v) => {
  try {
    sanitizeDoc(v);
    return true;
  } catch {
    return false;
  }
}, 'Invalid rich text');
