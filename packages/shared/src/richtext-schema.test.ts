import { describe, expect, it } from 'vitest';
import {
  docSizeProblem,
  docTextLength,
  POST_DOC_LIMITS,
  sanitizeDoc,
  WIKI_DOC_LIMITS,
} from './richtext-schema';
import type { RichNode } from './richtext';

const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });
const text = (t: string): RichNode => ({ type: 'text', text: t });
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content });

describe('docTextLength', () => {
  it('counts text, mentions, emoji and image descriptions', () => {
    const d = doc(
      p(text('hello'), { type: 'mention', attrs: { id: 'u1', label: 'bob' } }),
      p({ type: 'emoji', attrs: { name: 'fire' } }),
      { type: 'image', attrs: { src: 'u/abcdefgh12.webp', alt: 'a cat' } },
    );
    expect(docTextLength(d)).toBe(5 + 4 + 6 + 5);
  });

  it('stops counting once past the limit', () => {
    const d = doc(...Array.from({ length: 1000 }, () => p(text('x'.repeat(100)))));
    expect(docTextLength(d)).toBe(100_000);
    const partial = docTextLength(d, 250);
    expect(partial).toBeGreaterThan(250);
    expect(partial).toBeLessThan(1000);
  });
});

describe('docSizeProblem', () => {
  it('lets a normal post through', () => {
    expect(docSizeProblem(doc(p(text('Hello there'))), POST_DOC_LIMITS)).toBeNull();
  });

  it('refuses too much text, even spread over many small nodes', () => {
    const d = sanitizeDoc(doc(...Array.from({ length: 2000 }, () => p(text('y'.repeat(25))))));
    expect(docSizeProblem(d, POST_DOC_LIMITS)).toMatch(/under 40,000 characters/);
    // The same fits on a wiki page, which may be longer.
    expect(docSizeProblem(d, WIKI_DOC_LIMITS)).toBeNull();
  });

  it('refuses a document that is small in text but large stored', () => {
    // 4,000 image descriptions of a few characters, each in its own node with attributes.
    const d = sanitizeDoc(
      doc(
        ...Array.from({ length: 4000 }, () => ({
          type: 'image',
          attrs: { src: 'u/abcdefghij1234567890.webp', alt: 'pic', title: 't'.repeat(10) },
        })),
      ),
    );
    expect(docTextLength(d)).toBeLessThan(POST_DOC_LIMITS.maxChars);
    expect(docSizeProblem(d, POST_DOC_LIMITS)).toMatch(/too long to save/);
  });

  it('checks a huge document quickly', () => {
    // As big as the sanitizer allows: 5,000 nodes of 20,000 characters.
    const d = doc(...Array.from({ length: 2499 }, () => p(text('z'.repeat(20_000)))));
    const started = performance.now();
    expect(docSizeProblem(d, POST_DOC_LIMITS)).not.toBeNull();
    expect(performance.now() - started).toBeLessThan(100);
  });
});
