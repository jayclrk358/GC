import { describe, expect, it } from 'vitest';
import {
  decodePrefsCookie,
  DEFAULT_PREFS,
  encodePrefsCookie,
  parsePrefs,
  prefsToHtmlAttributes,
} from './prefs';

describe('preferences', () => {
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
