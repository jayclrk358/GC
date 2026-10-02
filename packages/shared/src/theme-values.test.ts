import { describe, expect, it } from 'vitest';
import { themeSchema } from './theme';
import { DEFAULT_THEME, PRESET_KEYS, themeFromPreset } from './theme-values';

describe('theme values', () => {
  it('builds presets exactly as the schema would', () => {
    for (const key of PRESET_KEYS) {
      const theme = themeFromPreset(key);
      // Same keys, values and order, so stored themes and the CSS don't change.
      expect(JSON.stringify(themeSchema.parse(theme))).toBe(JSON.stringify(theme));
    }
    expect(themeSchema.parse(DEFAULT_THEME)).toStrictEqual(DEFAULT_THEME);
  });
});
