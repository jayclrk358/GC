import { describe, expect, it } from 'vitest';
import { isPlayUrl, playLink } from './community';
import { communityBasicsSchema } from './community-schema';

describe('play links', () => {
  it('turns a Roblox experience page into a launch link', () => {
    for (const url of [
      'https://www.roblox.com/games/920587237/Adopt-Me',
      'https://roblox.com/games/920587237',
      'https://www.roblox.com/en-gb/games/920587237/Adopt-Me?privateServerLinkCode=1',
      'https://web.roblox.com/games/920587237/',
    ]) {
      expect(playLink(url)).toEqual({
        href: 'https://www.roblox.com/games/start?placeId=920587237',
        platform: 'roblox',
        host: 'roblox.com',
      });
    }
  });

  it('keeps other https links as they are', () => {
    expect(playLink('https://store.steampowered.com/app/252490/Rust/')).toEqual({
      href: 'https://store.steampowered.com/app/252490/Rust/',
      platform: null,
      host: 'store.steampowered.com',
    });
  });

  it('refuses anything that is not a plain https link', () => {
    for (const url of [
      'http://example.com',
      'javascript:alert(1)',
      'steam://run/730',
      'https://user:pass@example.com',
      'https://localhost',
      'not a url',
    ]) {
      expect(isPlayUrl(url)).toBe(false);
      expect(playLink(url)).toBeNull();
    }
    // Look-alike hosts don't get the Roblox treatment.
    expect(playLink('https://roblox.com.evil.example/games/1')?.platform).toBeNull();
  });

  it('accepts a blank play link as "none" in community settings', () => {
    const base = { name: 'Test hub', slug: 'test-hub' };
    expect(communityBasicsSchema.parse({ ...base, playUrl: '  ' }).playUrl).toBeNull();
    expect(communityBasicsSchema.parse(base).playUrl).toBeNull();
    expect(communityBasicsSchema.safeParse({ ...base, playUrl: 'http://x.com' }).success).toBe(
      false,
    );
  });
});
