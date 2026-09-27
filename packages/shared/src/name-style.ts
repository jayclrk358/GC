import { isHex, readableOn, suggestForeground } from './color';

/**
 * Nametag effects set per role. A member's name uses the effect of their highest role that has
 * one. Kept free of zod: this runs wherever names are shown.
 */
export const NAME_EFFECTS = ['none', 'color', 'gradient', 'glow', 'rainbow'] as const;
export type NameEffect = (typeof NAME_EFFECTS)[number];

export const NAME_ANIMATIONS = ['none', 'shimmer', 'pulse', 'flow'] as const;
export type NameAnimation = (typeof NAME_ANIMATIONS)[number];

export interface NameStyle {
  effect: NameEffect;
  /** Second colour, for gradients (the first is the role colour). */
  color2: string | null;
  animation: NameAnimation;
}

export const DEFAULT_NAME_STYLE: NameStyle = { effect: 'none', color2: null, animation: 'none' };

/** What the page needs to draw a styled name, with colours already made readable. */
export interface NameStyleView {
  effect: Exclude<NameEffect, 'none'>;
  animation: NameAnimation;
  /** [first, second] colour for the community's light and dark colour sets. */
  light: [string, string];
  dark: [string, string];
  /** Rainbow stops (a CSS colour list) for each set, for the rainbow effect. */
  rainbow?: { light: string; dark: string };
}

/** The backgrounds names are drawn on, per colour set: page, cards and raised cards. */
export interface NameBackdrops {
  light: string[];
  dark: string[];
}

export const DEFAULT_BACKDROPS: NameBackdrops = { light: ['#ffffff'], dark: ['#12131a'] };

/** A community theme's backgrounds (its "light" set can itself be dark, and vice versa). */
export function themeBackdrops(theme: {
  light: Record<string, string>;
  dark: Record<string, string>;
}): NameBackdrops {
  const pick = (set: Record<string, string>) =>
    [set.bg, set.surface, set.surface2].filter((c): c is string => Boolean(c && isHex(c)));
  const light = pick(theme.light);
  const dark = pick(theme.dark);
  return {
    light: light.length ? light : DEFAULT_BACKDROPS.light,
    dark: dark.length ? dark : DEFAULT_BACKDROPS.dark,
  };
}

const FALLBACK = '#7c3aed';
const RAINBOW = ['#e11d48', '#f59e0b', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899'];

/** Names are text, so every colour is nudged to at least 4.5:1 against each background. */
function readable(color: string, backgrounds: string[]): string {
  let c = color;
  for (const bg of backgrounds) c = suggestForeground(c, bg, 4.5) ?? readableOn(bg);
  return c;
}

function rainbowFor(backgrounds: string[]): string {
  const stops = RAINBOW.map((c) => readable(c, backgrounds));
  return [...stops, stops[0]].join(', ');
}

export function nameStyleView(
  roleColor: string | null | undefined,
  style: Partial<NameStyle> | null | undefined,
  backdrops: NameBackdrops = DEFAULT_BACKDROPS,
): NameStyleView | null {
  const effect = style?.effect;
  if (!effect || effect === 'none' || !NAME_EFFECTS.includes(effect)) return null;
  const animation = NAME_ANIMATIONS.includes(style.animation as NameAnimation)
    ? (style.animation as NameAnimation)
    : 'none';
  const c1 = roleColor && isHex(roleColor) ? roleColor : FALLBACK;
  const c2 = style.color2 && isHex(style.color2) ? style.color2 : c1;
  return {
    effect,
    animation,
    light: [readable(c1, backdrops.light), readable(c2, backdrops.light)],
    dark: [readable(c1, backdrops.dark), readable(c2, backdrops.dark)],
    ...(effect === 'rainbow'
      ? { rainbow: { light: rainbowFor(backdrops.light), dark: rainbowFor(backdrops.dark) } }
      : {}),
  };
}

/**
 * The name style and icon a member shows: from their highest role with an effect, and their
 * highest role with an icon (roles sorted however; position decides).
 */
export function pickRoleDecor<
  R extends {
    position: number;
    color: string | null;
    nameStyle?: Partial<NameStyle> | null;
    iconKey?: string | null;
    name: string;
  },
>(
  roles: R[],
  backdrops: NameBackdrops = DEFAULT_BACKDROPS,
): { nameStyle: NameStyleView | null; icon: { key: string; roleName: string } | null } {
  const sorted = [...roles].sort((a, b) => b.position - a.position);
  const styled = sorted.find((r) => r.nameStyle?.effect && r.nameStyle.effect !== 'none');
  const withIcon = sorted.find((r) => r.iconKey);
  return {
    nameStyle: styled ? nameStyleView(styled.color, styled.nameStyle, backdrops) : null,
    icon: withIcon ? { key: withIcon.iconKey!, roleName: withIcon.name } : null,
  };
}
