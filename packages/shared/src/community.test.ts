import { describe, expect, it } from 'vitest';
import { isPlayUrl, playLink, robloxPlaceId } from './community';
import { connectLink, displayAddress } from './game-server';
import { serverInputSchema } from './game-server-schema';
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

describe('Roblox listings', () => {
  const base = { name: 'My obby', protocol: 'roblox' as const, port: 0 };

  it('stores the place id from an experience link', () => {
    const v = serverInputSchema.parse({
      ...base,
      host: 'https://www.roblox.com/games/920587237/Adopt-Me',
    });
    expect(v.host).toBe('920587237');
    expect(v.port).toBe(0);
    expect(robloxPlaceId('920587237')).toBe('920587237');
  });

  it('rejects links that are not Roblox experiences', () => {
    const r = serverInputSchema.safeParse({ ...base, host: 'https://example.com/games/1' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['host']);
  });

  it('still needs a hostname and port for other games', () => {
    const r = serverInputSchema.safeParse({
      name: 'Craft',
      protocol: 'minecraft',
      host: 'x',
      port: 0,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(['host', 'port']);
  });

  it('launches and describes Roblox listings by place id', () => {
    expect(connectLink('roblox', '920587237', 0)).toBe(
      'https://www.roblox.com/games/start?placeId=920587237',
    );
    expect(displayAddress('roblox', '920587237', 0)).toBe('roblox.com/games/920587237');
  });
});
