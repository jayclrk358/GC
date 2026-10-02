import { describe, expect, it } from 'vitest';
import { decodePrefsCookie, parsePrefs, prefsSchema } from './prefs';
import {
  DEFAULT_PREFS,
  encodePrefsCookie,
  prefsToHtmlAttributes,
  soundForEvent,
} from './prefs-values';

describe('preferences', () => {
  it('keeps the plain defaults in step with the schema', () => {
    expect(prefsSchema.parse({})).toEqual(DEFAULT_PREFS);
  });

  it('round-trips through the cookie', () => {
    const prefs = {
      ...DEFAULT_PREFS,
      contrast: 'high' as const,
      fontScale: 150,
      keymap: { help: 'h' },
    };
    expect(decodePrefsCookie(encodePrefsCookie(prefs))).toEqual(prefs);
  });

  it('stores only non-default values', () => {
    expect(encodePrefsCookie(DEFAULT_PREFS)).toBe(encodePrefsCookie({ ...DEFAULT_PREFS }));
    expect(atob(encodePrefsCookie(DEFAULT_PREFS))).toBe('{}');
  });

  it('works out which sound an event plays', () => {
    const base = { ...DEFAULT_PREFS };
    expect(soundForEvent(base, 'mention')).toBe('magnox');
    // Every message is opt-in.
    expect(soundForEvent(base, 'message')).toBeNull();
    expect(soundForEvent({ ...base, soundEvents: { message: 'on' } }, 'message')).toBe('magnox');
    expect(soundForEvent({ ...base, soundEvents: { mention: 'arcade' } }, 'mention')).toBe(
      'arcade',
    );
    expect(soundForEvent({ ...base, soundEvents: { mention: 'off' } }, 'mention')).toBeNull();
    expect(soundForEvent({ ...base, soundPack: 'soft' }, 'mute')).toBe('soft');
    expect(soundForEvent({ ...base, sounds: false }, 'mention')).toBeNull();
    expect(soundForEvent({ ...base, soundVolume: 0 }, 'mention')).toBeNull();
  });

  it('keeps sound choices that make sense and drops the rest', () => {
    const p = parsePrefs({
      ...DEFAULT_PREFS,
      soundPack: 'kazoo',
      soundVolume: 300,
      soundEvents: { mention: 'crystal', nonsense: 'on' },
    });
    expect(p.soundPack).toBe('magnox');
    expect(p.soundVolume).toBe(60);
    expect(p.soundEvents).toEqual({});
    expect(
      parsePrefs({ ...DEFAULT_PREFS, soundEvents: { mention: 'crystal', send: 'on' } }).soundEvents,
    ).toEqual({ mention: 'crystal', send: 'on' });
  });

  it('falls back to defaults for garbage', () => {
    expect(decodePrefsCookie('not-base64!!')).toEqual(DEFAULT_PREFS);
    expect(decodePrefsCookie(undefined)).toEqual(DEFAULT_PREFS);
    expect(decodePrefsCookie('x'.repeat(5000))).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid fields and resets invalid ones', () => {
    const p = parsePrefs({
      ...DEFAULT_PREFS,
      contrast: 'high',
      fontScale: 999,
      colorScheme: 'purple',
    });
    expect(p.contrast).toBe('high');
    expect(p.fontScale).toBe(100);
    expect(p.colorScheme).toBe('system');
  });

  it('produces only enumerated attribute values', () => {
    const attrs = prefsToHtmlAttributes(DEFAULT_PREFS);
    for (const v of Object.values(attrs)) expect(v).toMatch(/^[a-z-]+$/);
  });
});
