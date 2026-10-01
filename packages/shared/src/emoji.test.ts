import { describe, expect, it } from 'vitest';
import {
  customReaction,
  customReactionId,
  emojiNameSchema,
  matchEmoji,
  STANDARD_EMOJI,
} from './emoji';

describe('custom emoji', () => {
  it('names are lower case letters, numbers and underscores', () => {
    expect(emojiNameSchema.parse(' Party_Parrot ')).toBe('party_parrot');
    expect(emojiNameSchema.safeParse('a').success).toBe(false);
    expect(emojiNameSchema.safeParse('no spaces').success).toBe(false);
    expect(emojiNameSchema.safeParse('x'.repeat(33)).success).toBe(false);
  });

  it('round-trips custom reactions and rejects anything else', () => {
    const id = '0190c3e2-7a1b-7c00-8000-123456789abc';
    expect(customReactionId(customReaction(id))).toBe(id);
    expect(customReactionId('👍')).toBeNull();
    expect(customReactionId('c:not-a-uuid')).toBeNull();
  });

  it('suggests names that start with the query first, then ones containing it', () => {
    const items = [{ name: 'heart' }, { name: 'blue_heart' }, { name: 'hearth' }, { name: 'x' }];
    expect(matchEmoji(items, 'heart').map((e) => e.name)).toEqual([
      'heart',
      'hearth',
      'blue_heart',
    ]);
    expect(matchEmoji(items, '', 2)).toHaveLength(2);
  });

  it('has unique standard names and characters', () => {
    const names = STANDARD_EMOJI.map(([n]) => n);
    const chars = STANDARD_EMOJI.map(([, c]) => c);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(chars).size).toBe(chars.length);
    for (const n of names) expect(n).toMatch(/^[a-z0-9_]+$/);
  });
});
