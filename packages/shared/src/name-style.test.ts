import { describe, expect, it } from 'vitest';
import { contrastRatio } from './color';
import {
  isPaletteEffect,
  LETTER_ANIMATIONS,
  nameStyleView,
  PALETTE_EFFECTS,
  pickRoleDecor,
  themeBackdrops,
} from './name-style';

describe('name styles', () => {
  it('only treats real palette effects as palette effects', () => {
    expect(isPaletteEffect('gold')).toBe(true);
    for (const e of ['color', 'toString', 'constructor', '__proto__']) {
      expect(isPaletteEffect(e)).toBe(false);
    }
  });

  it('gives plain names no style', () => {
    expect(nameStyleView('#ff0000', { effect: 'none' })).toBeNull();
    expect(nameStyleView('#ff0000', null)).toBeNull();
  });

  it('makes colours readable on the theme backgrounds of each set', () => {
    // A pale yellow is unreadable on white, and a dark navy on black.
    const light = { bg: '#ffffff', surface: '#f8f8f8', surface2: '#eeeeee' };
    const dark = { bg: '#050505', surface: '#101010', surface2: '#1a1a1a' };
    const v = nameStyleView(
      '#fff7a0',
      { effect: 'gradient', color2: '#0b1a3a', animation: 'flow' },
      themeBackdrops({ light, dark }),
    )!;
    for (const bg of Object.values(light)) {
      expect(contrastRatio(v.light[0], bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v.light[1], bg)).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of Object.values(dark)) {
      expect(contrastRatio(v.dark[0], bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v.dark[1], bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('follows the theme when its "light" set is actually dark', () => {
    const darkish = { bg: '#0f1424', surface: '#0f1424', surface2: '#1a2033' };
    const v = nameStyleView(
      '#1d4ed8',
      { effect: 'color' },
      themeBackdrops({ light: darkish, dark: darkish }),
    )!;
    expect(contrastRatio(v.light[0], '#0f1424')).toBeGreaterThanOrEqual(4.5);
  });

  it('builds readable rainbow stops', () => {
    const v = nameStyleView(null, { effect: 'rainbow', animation: 'shimmer' })!;
    for (const stop of v.palette!.light.split(', ')) {
      expect(contrastRatio(stop, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps every palette readable on light and dark backgrounds', () => {
    for (const effect of Object.keys(PALETTE_EFFECTS) as (keyof typeof PALETTE_EFFECTS)[]) {
      const v = nameStyleView('#3366ff', { effect })!;
      expect(v.palette, effect).toBeDefined();
      for (const stop of v.palette!.light.split(', ')) {
        expect(contrastRatio(stop, '#ffffff'), `${effect} ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const stop of v.palette!.dark.split(', ')) {
        expect(contrastRatio(stop, '#12131a'), `${effect} ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses its own main colour when one is set, otherwise the role colour', () => {
    expect(nameStyleView('#b91c1c', { effect: 'color', color: '#1d4ed8' })!.light[0]).toBe(
      '#1d4ed8',
    );
    expect(nameStyleView('#b91c1c', { effect: 'color', color: null })!.light[0]).toBe('#b91c1c');
  });

  it('drops animations that need colours the effect does not have', () => {
    expect(nameStyleView('#ff0000', { effect: 'glow', animation: 'flow' })!.animation).toBe('none');
    expect(nameStyleView('#ff0000', { effect: 'fire', animation: 'flow' })!.animation).toBe('flow');
    expect(nameStyleView('#ff0000', { effect: 'neon', animation: 'wave' })!.animation).toBe('wave');
    expect(LETTER_ANIMATIONS.has('wave')).toBe(true);
  });

  it('uses the highest styled role and the highest role with an icon', () => {
    const decor = pickRoleDecor([
      {
        name: 'Member',
        position: 1,
        color: '#22c55e',
        nameStyle: { effect: 'glow' },
        iconKey: 'u/aaaaaaaa.webp',
      },
      { name: 'Admin', position: 5, color: '#e11d48', nameStyle: { effect: 'gradient' } },
      { name: 'Plain', position: 9, color: null, nameStyle: { effect: 'none' } },
    ]);
    expect(decor.nameStyle?.effect).toBe('gradient');
    expect(decor.icon).toEqual({ key: 'u/aaaaaaaa.webp', roleName: 'Member' });
  });

  it('shows only a still, plain colour without the name effects perk', () => {
    const plain = { nameEffects: false, roleIcons: false };
    const view = nameStyleView(
      '#e11d48',
      { effect: 'rainbow', animation: 'wave', color2: null },
      undefined,
      plain,
    );
    expect(view).toMatchObject({ effect: 'color', animation: 'none' });
    expect(view?.palette).toBeUndefined();
    expect(nameStyleView('#e11d48', { effect: 'none' }, undefined, plain)).toBeNull();
    const decor = pickRoleDecor(
      [
        {
          name: 'Member',
          position: 1,
          color: '#22c55e',
          nameStyle: { effect: 'glow', animation: 'pulse', color2: null },
          iconKey: 'u/aaaaaaaa.webp',
        },
      ],
      undefined,
      plain,
    );
    expect(decor.nameStyle).toMatchObject({ effect: 'color', animation: 'none' });
    expect(decor.icon).toBeNull();
  });
});
