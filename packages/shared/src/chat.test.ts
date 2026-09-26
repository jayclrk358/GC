import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  extractLinks,
  mentionsMe,
  parseOpenGraph,
  startsNewGroup,
  summariseForAnnouncement,
  messageInputSchema,
  parseSearchQuery,
  toChatDoc,
} from './chat';
import { newId, timeOfUuid, uuidAtTime } from './ids';
import type { RichNode } from './richtext';

const text = (t: string, marks?: RichNode['marks']): RichNode => ({
  type: 'text',
  text: t,
  ...(marks ? { marks } : {}),
});
const doc = (...content: RichNode[]): RichNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});

describe('uuidAtTime', () => {
  it('sorts before every id generated at or after that moment', () => {
    const before = uuidAtTime(Date.now() - 1);
    const id = newId();
    expect(before < id).toBe(true);
    expect(uuidAtTime(Date.now() + 60_000) > id).toBe(true);
    expect(Math.abs(timeOfUuid(id) - Date.now())).toBeLessThan(5000);
  });
  it('is a valid uuid shape', () => {
    expect(uuidAtTime(new Date('2026-01-01T00:00:00Z'))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7000-8000-0{12}$/,
    );
  });
});

describe('extractLinks', () => {
  it('finds bare URLs and link marks, trims punctuation and dedupes', () => {
    const d = doc(
      text('See https://example.com/a, and (https://example.com/b).'),
      text('docs', [{ type: 'link', attrs: { href: 'https://example.com/a' } }]),
    );
    expect(extractLinks(d)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });
  it('ignores code and caps the count', () => {
    const d: RichNode = {
      type: 'doc',
      content: [
        { type: 'codeBlock', content: [text('https://code.example')] },
        { type: 'paragraph', content: [text('https://inline.example', [{ type: 'code' }])] },
        {
          type: 'paragraph',
          content: [text('https://a.test https://b.test https://c.test https://d.test')],
        },
      ],
    };
    expect(extractLinks(d)).toEqual(['https://a.test', 'https://b.test', 'https://c.test']);
  });
  it('skips non-http links', () => {
    expect(
      extractLinks(doc(text('mail', [{ type: 'link', attrs: { href: 'mailto:a@b.c' } }]))),
    ).toEqual([]);
  });
});

describe('mentionsMe', () => {
  const msg = { mentionUserIds: ['u1'], mentionRoleIds: ['r1'], mentionEveryone: false };
  it('matches direct, role and everyone mentions', () => {
    expect(mentionsMe(msg, 'u1', [])).toBe(true);
    expect(mentionsMe(msg, 'u2', ['r1'])).toBe(true);
    expect(mentionsMe(msg, 'u2', ['r2'])).toBe(false);
    expect(mentionsMe({ ...msg, mentionEveryone: true }, 'u9', [])).toBe(true);
    expect(mentionsMe(msg, null, ['r1'])).toBe(false);
  });
});

describe('startsNewGroup', () => {
  const t0 = new Date('2026-05-01T12:00:00Z');
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);
  it('groups quick consecutive messages from one author', () => {
    expect(
      startsNewGroup(
        { authorId: 'a', createdAt: at(0) },
        { authorId: 'a', createdAt: at(2), replyToId: null },
      ),
    ).toBe(false);
  });
  it('breaks on another author, a long gap, a reply or the first message', () => {
    expect(startsNewGroup(undefined, { authorId: 'a', createdAt: at(0), replyToId: null })).toBe(
      true,
    );
    expect(
      startsNewGroup(
        { authorId: 'a', createdAt: at(0) },
        { authorId: 'b', createdAt: at(1), replyToId: null },
      ),
    ).toBe(true);
    expect(
      startsNewGroup(
        { authorId: 'a', createdAt: at(0) },
        { authorId: 'a', createdAt: at(10), replyToId: null },
      ),
    ).toBe(true);
    expect(
      startsNewGroup(
        { authorId: 'a', createdAt: at(0) },
        { authorId: 'a', createdAt: at(1), replyToId: 'x' },
      ),
    ).toBe(true);
  });
});

describe('summariseForAnnouncement', () => {
  const item = (authorName: string, over: Partial<{ mentionsMe: boolean; own: boolean }> = {}) => ({
    authorName,
    text: `hello from ${authorName}`,
    mentionsMe: false,
    own: false,
    ...over,
  });
  it('reads a single message in full', () => {
    expect(summariseForAnnouncement([item('Ana')], 'all')).toEqual({
      kind: 'single',
      authorName: 'Ana',
      text: 'hello from Ana',
      mention: false,
    });
  });
  it('summarises bursts', () => {
    expect(summariseForAnnouncement([item('Ana'), item('Bo'), item('Ana')], 'all')).toEqual({
      kind: 'many',
      count: 3,
      authors: ['Ana', 'Bo'],
      mentions: 0,
    });
  });
  it('respects verbosity and never reads your own messages', () => {
    expect(summariseForAnnouncement([item('Ana')], 'mentions')).toBeNull();
    expect(summariseForAnnouncement([item('Ana', { mentionsMe: true })], 'mentions')).toMatchObject(
      { kind: 'single', mention: true },
    );
    expect(summariseForAnnouncement([item('Me', { own: true })], 'all')).toBeNull();
    expect(summariseForAnnouncement([item('Ana', { mentionsMe: true })], 'off')).toBeNull();
  });
});

describe('parseOpenGraph', () => {
  it('prefers OpenGraph tags and resolves relative images', () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Blockhaven &amp; Friends">
      <meta content='A friendly server' property='og:description'>
      <meta property="og:site_name" content="Blockhaven">
      <meta property="og:image" content="/img/banner.png">
    </head><body>ignored</body></html>`;
    expect(parseOpenGraph(html, 'https://blockhaven.example/page')).toEqual({
      title: 'Blockhaven & Friends',
      description: 'A friendly server',
      siteName: 'Blockhaven',
      image: 'https://blockhaven.example/img/banner.png',
    });
  });
  it('falls back to <title>, meta description and the hostname', () => {
    const html = '<title> Plain\n page </title><meta name="description" content="Just text">';
    expect(parseOpenGraph(html, 'https://www.site.example/x')).toEqual({
      title: 'Plain page',
      description: 'Just text',
      siteName: 'site.example',
      image: null,
    });
  });
  it('rejects javascript: images and empty pages', () => {
    const html =
      '<meta property="og:title" content="T"><meta property="og:image" content="javascript:alert(1)">';
    expect(parseOpenGraph(html, 'https://x.example')?.image).toBeNull();
    expect(parseOpenGraph('<p>nothing</p>', 'https://x.example')).toBeNull();
  });
  it('decodes numeric entities', () => {
    expect(decodeEntities('&#39;hi&#x27; &lt;b&gt;')).toBe("'hi' <b>");
  });
});

describe('messageInputSchema', () => {
  it('accepts a message and rejects too many attachments', () => {
    const body = doc(text('hi'));
    expect(messageInputSchema.parse({ body }).attachments).toEqual([]);
    const attachments = Array.from({ length: 5 }, () => ({ key: 'u/abcdefgh12.webp', alt: '' }));
    expect(messageInputSchema.safeParse({ body, attachments }).success).toBe(false);
  });
});

describe('toChatDoc', () => {
  it('flattens headings and drops images and dividers', () => {
    const d: RichNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
        { type: 'image', attrs: { src: 'u/abcdefgh12.webp', alt: '' } },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [text('body')] },
        { type: 'paragraph' },
      ],
    };
    expect(toChatDoc(d)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [text('Title')] },
        { type: 'paragraph', content: [text('body')] },
      ],
    });
  });
});

describe('parseSearchQuery', () => {
  it('pulls out from: and in: operators', () => {
    expect(parseSearchQuery('from:@Alice in:#general  build contest')).toEqual({
      text: 'build contest',
      from: 'alice',
      in: 'general',
    });
    expect(parseSearchQuery('just words')).toEqual({ text: 'just words', from: null, in: null });
  });
});
