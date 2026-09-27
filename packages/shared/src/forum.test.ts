import { describe, expect, it } from 'vitest';
import { hotScore, slugifyTitle } from './forum';
import { channelInputSchema, channelNameSchema, threadInputSchema } from './forum-schema';
import { docFromText } from './richtext';

describe('forum schemas', () => {
  it('normalises channel names into URL-safe slugs', () => {
    expect(channelNameSchema.parse('  General Chat ')).toBe('general-chat');
    expect(channelNameSchema.safeParse('bad name!').success).toBe(false);
    expect(channelNameSchema.safeParse('-edge').success).toBe(false);
  });

  it('accepts categories and forums with defaults', () => {
    const forum = channelInputSchema.parse({ type: 'forum', name: 'guides' });
    expect(forum).toMatchObject({ type: 'forum', name: 'guides', topic: '', parentId: null });
    expect(channelInputSchema.parse({ type: 'category', name: 'Community' }).type).toBe('category');
  });

  it('validates thread bodies as rich text', () => {
    const ok = threadInputSchema.safeParse({
      channelId: '01234567-89ab-7def-8123-456789abcdef',
      title: 'Hello world',
      body: docFromText('Hi'),
    });
    expect(ok.success).toBe(true);
    const bad = threadInputSchema.safeParse({
      channelId: '01234567-89ab-7def-8123-456789abcdef',
      title: 'Hello world',
      body: { type: 'doc', content: [{ type: 'script' }] },
    });
    expect(bad.success).toBe(false);
  });

  it('slugifies titles', () => {
    expect(slugifyTitle('How do I join the  Server?!')).toBe('how-do-i-join-the-server');
    expect(slugifyTitle('Crème brûlée guide')).toBe('creme-brulee-guide');
  });
});

describe('hotScore', () => {
  const base = new Date('2026-06-01T00:00:00Z');
  it('ranks newer threads above older ones with the same score', () => {
    const newer = new Date(base.getTime() + 24 * 3600_000);
    expect(hotScore(10, 0, newer)).toBeGreaterThan(hotScore(10, 0, base));
  });
  it('ranks higher scores above lower ones at the same age', () => {
    expect(hotScore(100, 0, base)).toBeGreaterThan(hotScore(10, 0, base));
  });
  it('lets a day of age outweigh a 10x vote difference only after ~12.5 hours', () => {
    const later = new Date(base.getTime() + 12.5 * 3600_000);
    expect(hotScore(10, 0, later)).toBeCloseTo(hotScore(100, 0, base), 1);
  });
  it('treats negative scores as a penalty', () => {
    expect(hotScore(-10, 0, base)).toBeLessThan(hotScore(0, 0, base));
  });
});
