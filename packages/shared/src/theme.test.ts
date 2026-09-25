import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance, suggestForeground } from './color';
import {
  autoFixTheme,
  checkTheme,
  DEFAULT_THEME,
  PRESET_KEYS,
  themeFromPreset,
  themeSchema,
  themeToCss,
} from './theme';

describe('contrast maths', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('suggests the nearest passing foreground', () => {
    const fixed = suggestForeground('#999999', '#ffffff', 4.5);
    expect(fixed).not.toBeNull();
    expect(contrastRatio(fixed!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    // It should darken, not jump to black.
    expect(fixed).not.toBe('#000000');
  });

  it('returns the colour unchanged when it already passes', () => {
    expect(suggestForeground('#000000', '#ffffff', 4.5)).toBe('#000000');
  });
});

describe('themes', () => {
  it.each(PRESET_KEYS)('preset %s passes every contrast rule', (key) => {
    expect(checkTheme(themeFromPreset(key))).toEqual([]);
  });

  it('flags and auto-fixes a failing theme', () => {
    const bad = {
      ...DEFAULT_THEME,
      light: { ...DEFAULT_THEME.light, text: '#aaaaaa', primary: '#9999ff' },
    };
    const issues = checkTheme(bad);
    expect(issues.map((i) => i.rule)).toContain('text-on-bg');
    expect(issues.every((i) => i.suggestion)).toBe(true);
    expect(checkTheme(autoFixTheme(bad))).toEqual([]);
  });

  it('rejects anything that is not a hex colour (no CSS injection)', () => {
    const evil = {
      ...DEFAULT_THEME,
      light: { ...DEFAULT_THEME.light, bg: 'red;}body{display:none' },
    };
    expect(themeSchema.safeParse(evil).success).toBe(false);
    expect(() => themeToCss(evil as never)).toThrow();
  });

  it('emits layered CSS for each default scheme', () => {
    const css = themeToCss(DEFAULT_THEME);
    expect(css.startsWith('@layer mx-community{')).toBe(true);
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    const dark = themeToCss({ ...DEFAULT_THEME, defaultScheme: 'dark' });
    expect(dark).toContain('html[data-scheme="light"] [data-community-theme]');
    expect(dark).not.toContain('@media');
    const root = themeToCss(DEFAULT_THEME, ':root', 'mx-tokens');
    expect(root).toContain('html[data-scheme="dark"]{');
  });
});
