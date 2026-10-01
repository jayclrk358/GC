import { describe, expect, it } from 'vitest';
import {
  automodSchema,
  DEFAULT_AUTOMOD,
  findBlockedWord,
  findLinks,
  hasInviteLink,
  normalizeForMatch,
  scanContent,
} from './automod';

describe('automod words', () => {
  it('normalizes accents, look-alikes, invisible characters and punctuation', () => {
    expect(normalizeForMatch('Héllo, W0rld!!')).toBe(' hello world ');
    expect(normalizeForMatch('sh!t $cam @ll')).toBe(' shit scam all ');
    expect(normalizeForMatch('sp​am')).toBe(' spam ');
    expect(normalizeForMatch('  ')).toBe(' ');
  });

  it('matches whole words and phrases, not parts of words', () => {
    const list = ['scam', 'free nitro'];
    expect(findBlockedWord('this is a SCAM', list)).toBe('scam');
    expect(findBlockedWord('what a scam!', list)).toBe('scam');
    expect(findBlockedWord('s c a m', list)).toBeNull();
    expect(findBlockedWord('scampi for dinner', list)).toBeNull();
    expect(findBlockedWord('get FREE   nitro now', list)).toBe('free nitro');
    expect(findBlockedWord('free, nitro', list)).toBe('free nitro');
    expect(findBlockedWord('fr33 n1tro', list)).toBe('free nitro');
  });

  it('supports * at either end', () => {
    expect(findBlockedWord('total scammers', ['scam*'])).toBe('scam*');
    expect(findBlockedWord('mega-scam', ['*scam'])).toBe('*scam');
    expect(findBlockedWord('megascammer', ['*scam*'])).toBe('*scam*');
    expect(findBlockedWord('megascammer', ['scam*'])).toBeNull();
  });

  it('finds words in scripts written without spaces', () => {
    expect(findBlockedWord('这是诈骗链接', ['诈骗'])).toBe('诈骗');
  });
});

describe('automod links', () => {
  it('finds full links and bare domains, but not email addresses', () => {
    const links = findLinks('see https://a.example.com/x and free-nitro.gift or mail me@site.com');
    expect(links).toContain('https://a.example.com/x');
    expect(links).toContain('free-nitro.gift');
    expect(links).not.toContain('site.com');
  });

  it('spots invite links', () => {
    expect(hasInviteLink('join discord.gg/abc123')).toBe(true);
    expect(hasInviteLink('https://discord.com/invite/xyz')).toBe(true);
    expect(hasInviteLink('https://t.me/+AbCdEf')).toBe(true);
    expect(hasInviteLink('discord is fun')).toBe(false);
  });
});

describe('scanContent', () => {
  const config = automodSchema.parse({
    words: { enabled: true, list: ['badword'], action: 'hold' },
    links: { enabled: true, allow: ['https://www.YouTube.com/watch'] },
    invites: { enabled: true },
    spam: { enabled: true, maxMentions: 2 },
  });

  it('does nothing with everything off', () => {
    expect(scanContent(DEFAULT_AUTOMOD, { text: 'badword discord.gg/x', mentions: 99 })).toBeNull();
  });

  it('cleans up allowed domains', () => {
    expect(config.links.allow).toEqual(['youtube.com']);
  });

  it('reports the first rule broken', () => {
    expect(scanContent(config, { text: 'a BadWord here' })).toEqual({
      rule: 'words',
      action: 'hold',
      match: 'badword',
    });
    expect(scanContent(config, { text: 'come to discord.gg/abc' })?.rule).toBe('invites');
    expect(scanContent(config, { text: 'look at evil.xyz/page' })).toMatchObject({
      rule: 'links',
      match: 'evil.xyz',
    });
    expect(scanContent(config, { text: 'hi @a @b @c', mentions: 3 })?.rule).toBe('mentions');
  });

  it('lets allowed sites through, subdomains included', () => {
    expect(scanContent(config, { text: 'https://m.youtube.com/watch?v=1' })).toBeNull();
    expect(
      scanContent(config, { text: 'click here', links: ['https://youtube.com/x'] }),
    ).toBeNull();
    expect(scanContent(config, { text: 'click here', links: ['https://evil.com'] })?.rule).toBe(
      'links',
    );
  });
});
