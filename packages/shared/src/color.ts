/** WCAG 2.x colour maths: parsing, relative luminance, contrast ratio and auto-fixes. */

export type RGB = { r: number; g: number; b: number };

const HEX_RE = /^#([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX_RE.test(value);
}

export function hexToRgb(hex: string): RGB {
  const m = HEX_RE.exec(hex);
  if (!m?.[1]) throw new Error(`Invalid colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function roundRatio(ratio: number): number {
  return Math.floor(ratio * 100) / 100;
}

type HSL = { h: number; s: number; l: number };

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

function withLightness(hex: string, l: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, l }));
}

/**
 * Find the colour closest to `fg` (same hue and saturation, only lightness changes) that
 * reaches `target` contrast against `bg`. Tries both directions and picks the smaller change.
 * Returns null if neither direction can reach the target.
 */
export function suggestForeground(fg: string, bg: string, target: number): string | null {
  if (contrastRatio(fg, bg) >= target) return fg;
  const { l } = rgbToHsl(hexToRgb(fg));
  const candidates: { hex: string; delta: number }[] = [];

  for (const dir of [-1, 1] as const) {
    const end = dir < 0 ? 0 : 1;
    if (contrastRatio(withLightness(fg, end), bg) < target) continue;
    // Binary search for the smallest lightness change that passes.
    let lo = l;
    let hi = end;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (contrastRatio(withLightness(fg, mid), bg) >= target) hi = mid;
      else lo = mid;
    }
    let hex = withLightness(fg, hi);
    // Rounding to 8-bit channels can dip just under the target; nudge until it passes.
    let step = hi;
    for (let i = 0; i < 20 && contrastRatio(hex, bg) < target; i++) {
      step = Math.min(1, Math.max(0, step + dir * 0.005));
      hex = withLightness(fg, step);
    }
    if (contrastRatio(hex, bg) >= target) candidates.push({ hex, delta: Math.abs(step - l) });
  }
  candidates.sort((a, b) => a.delta - b.delta);
  return candidates[0]?.hex ?? null;
}

/** Pick black or white text for a given background, whichever contrasts more. */
export function readableOn(bg: string): '#000000' | '#ffffff' {
  return contrastRatio('#000000', bg) >= contrastRatio('#ffffff', bg) ? '#000000' : '#ffffff';
}

/** Mix two colours; `amount` is the share of `b` (0..1). */
export function mix(a: string, b: string, amount: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * amount,
    g: ca.g + (cb.g - ca.g) * amount,
    b: ca.b + (cb.b - ca.b) * amount,
  });
}
