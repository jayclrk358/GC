import { describe, expect, it } from 'vitest';
import { ACCOUNT_KINDS, isTimeZone, normaliseHandle } from './profile';

const kind = (key: string) => ACCOUNT_KINDS.find((k) => k.key === key)!;

describe('profile accounts', () => {
  it('accepts real-looking handles and rejects junk', () => {
    expect(kind('roblox').pattern.test('CastleBuilder')).toBe(true);
    expect(kind('roblox').pattern.test('not a valid name!')).toBe(false);
    expect(kind('discord').pattern.test('castle.builder')).toBe(true);
    expect(kind('discord').pattern.test('Legacy Name#1234')).toBe(true);
    expect(kind('battlenet').pattern.test('Ashe#12345')).toBe(true);
    expect(kind('battlenet').pattern.test('Ashe')).toBe(false);
    expect(kind('steam').pattern.test('76561197960287930')).toBe(true);
  });

  it('builds profile links only for services that have them', () => {
    expect(kind('steam').url!('76561197960287930')).toBe(
      'https://steamcommunity.com/profiles/76561197960287930',
    );
    expect(kind('steam').url!('gaben')).toBe('https://steamcommunity.com/id/gaben');
    expect(kind('youtube').url!('@magnox')).toBe('https://www.youtube.com/@magnox');
    expect(kind('x').url!('magnox')).toBe('https://x.com/magnox');
    expect(kind('discord').url).toBeUndefined();
  });

  it('tidies Switch friend codes', () => {
    expect(normaliseHandle('nintendo', '1234 5678 9012')).toBe('SW-1234-5678-9012');
    expect(normaliseHandle('nintendo', 'sw-1234-5678-9012')).toBe('SW-1234-5678-9012');
    expect(normaliseHandle('roblox', '  Name ')).toBe('Name');
  });

  it('knows real time zones', () => {
    expect(isTimeZone('Europe/London')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});
