import { isHex, readableOn, suggestForeground } from './color';

/**
 * Nametag effects set per role. A member's name uses the effect of their highest role that has
 * one. Kept free of zod: this runs wherever names are shown.
 */
export const NAME_EFFECTS = [
  'none',
  'color',
  'gradient',
  'glow',
  'neon',
  'retro',
  'chrome',
  'gold',
  'rainbow',
  'fire',
  'ice',
  'sunset',
  'toxic',
  'ocean',
  'galaxy',
] as const;
export type NameEffect = (typeof NAME_EFFECTS)[number];

/** Effects painted from a fixed set of colours rather than the role colour. */
export const PALETTE_EFFECTS = {
  chrome: ['#475569', '#e2e8f0', '#64748b', '#f8fafc', '#475569'],
  gold: ['#b45309', '#fcd34d', '#d97706', '#fef3c7', '#b45309'],
  rainbow: ['#e11d48', '#f59e0b', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899'],
  fire: ['#dc2626', '#f97316', '#facc15', '#f97316'],
  ice: ['#0284c7', '#67e8f9', '#a5b4fc', '#e0f2fe'],
  sunset: ['#e11d48', '#fb923c', '#c026d3'],
  toxic: ['#16a34a', '#a3e635', '#22d3ee'],
  ocean: ['#1d4ed8', '#0891b2', '#2dd4bf'],
  galaxy: ['#7c3aed', '#db2777', '#2563eb', '#c084fc'],
} as const satisfies Partial<Record<NameEffect, readonly string[]>>;
export type PaletteEffect = keyof typeof PALETTE_EFFECTS;

export function isPaletteEffect(e: string): e is PaletteEffect {
  return Object.hasOwn(PALETTE_EFFECTS, e);
}

export const NAME_ANIMATIONS = [
  'none',
  'shimmer',
  'flow',
  'pulse',
  'wave',
  'bounce',
  'float',
  'jelly',
  'shake',
  'glitch',
  'flicker',
  'sparkle',
] as const;
export type NameAnimation = (typeof NAME_ANIMATIONS)[number];

/** Animations that move each letter on its own (the name is drawn letter by letter). */
export const LETTER_ANIMATIONS: ReadonlySet<NameAnimation> = new Set(['wave']);

/** Flow slides the name's colours along, so it needs more than one colour. */
export function animationFits(effect: NameEffect, animation: NameAnimation): boolean {
  if (animation !== 'flow') return true;
  return effect === 'gradient' || isPaletteEffect(effect);
}

export interface NameStyle {
  effect: NameEffect;
  /** Main colour; null uses the role colour. */
  color?: string | null;
  /** Second colour, for gradients, neon and retro. */
  color2: string | null;
  animation: NameAnimation;
}

export const DEFAULT_NAME_STYLE: NameStyle = {
  effect: 'none',
  color: null,
  color2: null,
  animation: 'none',
};

/** What the page needs to draw a styled name, with colours already made readable. */
export interface NameStyleView {
  effect: Exclude<NameEffect, 'none'>;
  animation: NameAnimation;
  /** [first, second] colour for the community's light and dark colour sets. */
  light: [string, string];
  dark: [string, string];
  /** Colour stops (a CSS colour list) for each set, for palette effects such as rainbow. */
  palette?: { light: string; dark: string };
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

/** Names are text, so every colour is nudged to at least 4.5:1 against each background. */
function readable(color: string, backgrounds: string[]): string {
  let c = color;
  for (const bg of backgrounds) c = suggestForeground(c, bg, 4.5) ?? readableOn(bg);
  return c;
}

function paletteFor(effect: PaletteEffect, backgrounds: string[]): string {
  const stops = PALETTE_EFFECTS[effect].map((c) => readable(c, backgrounds));
  // Repeat the first colour at the end so a flowing name loops without a seam.
  return [...stops, stops[0]].join(', ');
}

/**
 * Which decorations a community's plan shows (a plan's perks fit this). Without name effects a
 * styled name keeps just its colour, still; without role icons none are shown.
 */
export interface DecorPerks {
  nameEffects: boolean;
  roleIcons: boolean;
}

export function nameStyleView(
  roleColor: string | null | undefined,
  style: Partial<NameStyle> | null | undefined,
  backdrops: NameBackdrops = DEFAULT_BACKDROPS,
  perks?: Pick<DecorPerks, 'nameEffects'>,
): NameStyleView | null {
  const plain = perks?.nameEffects === false;
  const chosen = style?.effect;
  if (!chosen || chosen === 'none' || !NAME_EFFECTS.includes(chosen)) return null;
  const effect: Exclude<NameEffect, 'none'> = plain ? 'color' : chosen;
  const requested =
    !plain && NAME_ANIMATIONS.includes(style.animation as NameAnimation)
      ? (style.animation as NameAnimation)
      : 'none';
  const animation = animationFits(effect, requested) ? requested : 'none';
  const main = style.color && isHex(style.color) ? style.color : roleColor;
  const c1 = main && isHex(main) ? main : FALLBACK;
  const c2 = style.color2 && isHex(style.color2) ? style.color2 : c1;
  return {
    effect,
    animation,
    light: [readable(c1, backdrops.light), readable(c2, backdrops.light)],
    dark: [readable(c1, backdrops.dark), readable(c2, backdrops.dark)],
    ...(isPaletteEffect(effect)
      ? {
          palette: {
            light: paletteFor(effect, backdrops.light),
            dark: paletteFor(effect, backdrops.dark),
          },
        }
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
  perks?: DecorPerks,
): { nameStyle: NameStyleView | null; icon: { key: string; roleName: string } | null } {
  const sorted = [...roles].sort((a, b) => b.position - a.position);
  const styled = sorted.find((r) => r.nameStyle?.effect && r.nameStyle.effect !== 'none');
  const withIcon = perks?.roleIcons === false ? undefined : sorted.find((r) => r.iconKey);
  return {
    nameStyle: styled ? nameStyleView(styled.color, styled.nameStyle, backdrops, perks) : null,
    icon: withIcon ? { key: withIcon.iconKey!, roleName: withIcon.name } : null,
  };
}
