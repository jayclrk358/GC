import { describe, expect, it } from 'vitest';
import {
  blockConfigSchemas,
  defaultBlockConfig,
  BLOCK_TYPES,
  navSchema,
  normalizeNav,
  DEFAULT_NAV,
} from './blocks';
import { isValidSlug, slugify } from './slug';
import { newId, randomToken, isUuid } from './ids';
import { connectLink, displayAddress, serverInputSchema } from './game-server';

describe('slugs', () => {
  it('slugifies names', () => {
    expect(slugify('  Crème Brûlée Clan!! ')).toBe('creme-brulee-clan');
    expect(slugify('A'.repeat(50)).length).toBeLessThanOrEqual(32);
  });
  it('validates slugs', () => {
    expect(isValidSlug('minecraft-hub')).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('-bad')).toBe(false);
    expect(isValidSlug('double--dash')).toBe(false);
    expect(isValidSlug('settings')).toBe(false);
  });
});

describe('ids', () => {
  it('generates time-ordered uuids', () => {
    const a = newId();
    const b = newId();
    expect(isUuid(a)).toBe(true);
    expect(a < b).toBe(true);
  });
  it('generates unambiguous tokens', () => {
    expect(randomToken(12)).toMatch(/^[a-km-z2-9]{12}$/);
  });
});

describe('blocks', () => {
  it('has valid defaults for every block type', () => {
    for (const type of BLOCK_TYPES) {
      expect(() => blockConfigSchemas[type].parse(defaultBlockConfig(type))).not.toThrow();
    }
  });
  it('rejects non-https links and bad embeds', () => {
    expect(
      blockConfigSchemas.links.safeParse({ links: [{ label: 'x', url: 'http://insecure.dev' }] })
        .success,
    ).toBe(false);
    expect(
      blockConfigSchemas.embed.safeParse({ provider: 'youtube', ref: '"><script>', title: 'x' })
        .success,
    ).toBe(false);
  });
  it('keeps home visible and fills in missing tabs', () => {
    expect(
      navSchema.safeParse(DEFAULT_NAV.map((n) => ({ ...n, visible: n.tab !== 'home' }))).success,
    ).toBe(false);
    expect(normalizeNav([{ tab: 'home', label: '', visible: true }]).length).toBe(
      DEFAULT_NAV.length,
    );
  });
});

describe('game servers', () => {
  it('validates hosts', () => {
    const base = { name: 'Srv', protocol: 'minecraft', port: 25565 };
    expect(serverInputSchema.safeParse({ ...base, host: 'play.example.com' }).success).toBe(true);
    expect(serverInputSchema.safeParse({ ...base, host: '203.0.113.5' }).success).toBe(true);
    expect(serverInputSchema.safeParse({ ...base, host: 'http://x' }).success).toBe(false);
    expect(serverInputSchema.safeParse({ ...base, host: 'a b' }).success).toBe(false);
  });
  it('formats addresses and steam links', () => {
    expect(displayAddress('minecraft', 'play.x.com', 25565)).toBe('play.x.com');
    expect(displayAddress('minecraft', 'play.x.com', 25566)).toBe('play.x.com:25566');
    expect(connectLink('rust', '1.2.3.4', 28015)).toBe('steam://connect/1.2.3.4:28015');
    expect(connectLink('minecraft', '1.2.3.4', 25565)).toBeNull();
  });
});
