import { describe, expect, it } from 'vitest';
import {
  collectMentions,
  docToText,
  imagesMissingAlt,
  isSafeHref,
  RichTextError,
  sanitizeDoc,
} from './richtext';

const doc = (content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, marks?: unknown[]) => ({
  type: 'text',
  text: t,
  ...(marks ? { marks } : {}),
});

describe('rich text sanitizer', () => {
  it('accepts a normal document', () => {
    const d = doc([
      { type: 'heading', attrs: { level: 2 }, content: [text('Hello')] },
      p(
        text('bold', [{ type: 'bold' }]),
        text(' link', [{ type: 'link', attrs: { href: 'https://x.dev' } }]),
      ),
    ]);
    expect(sanitizeDoc(d)).toMatchObject({ type: 'doc' });
  });

  it('rejects unknown node types', () => {
    expect(() => sanitizeDoc(doc([{ type: 'iframe' }]))).toThrow(RichTextError);
    expect(() => sanitizeDoc(doc([p({ type: 'script', text: 'x' })]))).toThrow(RichTextError);
  });

  it('rejects javascript: and data: links', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,hi', '//evil.com', 'JaVaScRiPt:1']) {
      expect(isSafeHref(href)).toBe(false);
      expect(() => sanitizeDoc(doc([p(text('x', [{ type: 'link', attrs: { href } }]))]))).toThrow(
        RichTextError,
      );
    }
    expect(isSafeHref('/c/test')).toBe(true);
    expect(isSafeHref('mailto:a@b.co')).toBe(true);
  });

  it('only allows images that reference our uploads', () => {
    expect(() =>
      sanitizeDoc(doc([{ type: 'image', attrs: { src: 'https://evil/x.png' } }])),
    ).toThrow();
    const ok = sanitizeDoc(doc([{ type: 'image', attrs: { src: 'u/abcdefgh12.webp', alt: '' } }]));
    expect(imagesMissingAlt(ok)).toBe(1);
  });

  it('strips unknown attributes', () => {
    const out = sanitizeDoc(
      doc([{ type: 'heading', attrs: { level: 3, onclick: 'x' }, content: [text('h')] }]),
    );
    expect(out.content?.[0]?.attrs).toEqual({ level: 3 });
  });

  it('limits depth and size', () => {
    let deep: unknown = text('x');
    for (let i = 0; i < 20; i++) deep = { type: 'blockquote', content: [deep] };
    expect(() => sanitizeDoc(doc([deep]))).toThrow(/deeply/);
  });

  it('extracts text and mentions', () => {
    const d = sanitizeDoc(
      doc([p(text('hi '), { type: 'mention', attrs: { id: 'u1', label: 'ana', kind: 'user' } })]),
    );
    expect(docToText(d)).toBe('hi @ana');
    expect(collectMentions(d)).toEqual([{ kind: 'user', id: 'u1' }]);
  });
});
