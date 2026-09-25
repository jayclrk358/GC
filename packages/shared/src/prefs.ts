import { z } from 'zod';

export const FONT_SCALES = [87, 100, 112, 125, 150, 175, 200] as const;

export const prefsSchema = z.object({
  v: z.literal(1).default(1),
  colorScheme: z.enum(['system', 'light', 'dark']).default('system'),
  contrast: z.enum(['normal', 'high']).default('normal'),
  fontScale: z
    .number()
    .int()
    .refine((n) => (FONT_SCALES as readonly number[]).includes(n))
    .default(100),
  font: z.enum(['default', 'atkinson', 'opendyslexic', 'system']).default('default'),
  letterSpacing: z.enum(['normal', 'wide', 'wider']).default('normal'),
  lineHeight: z.enum(['normal', 'relaxed', 'loose']).default('normal'),
  motion: z.enum(['system', 'reduce', 'full']).default('system'),
  autoplayMedia: z.boolean().default(false),
  animatedImages: z.boolean().default(true),
  underlineLinks: z.boolean().default(false),
  colorblindRoleColors: z.boolean().default(false),
  density: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
  timeFormat: z.enum(['auto', '12h', '24h']).default('auto'),
  simplifiedLayout: z.boolean().default(false),
  communityThemes: z.boolean().default(true),
  focusRing: z.enum(['default', 'bold']).default('default'),
  chatAnnouncements: z.enum(['all', 'mentions', 'off']).default('mentions'),
  shortcuts: z.boolean().default(true),
  singleKeyShortcuts: z.boolean().default(true),
  requireAltTextReminder: z.boolean().default(true),
  /** Remapped keyboard shortcuts: shortcut id → key combo (e.g. "mod+k", "?", "g h"). */
  keymap: z
    .record(z.string().regex(/^[a-z-]{1,32}$/), z.string().max(24))
    .refine((m) => Object.keys(m).length <= 40)
    .default({}),
});

export type Prefs = z.infer<typeof prefsSchema>;

export const DEFAULT_PREFS: Prefs = prefsSchema.parse({});

export const PREFS_COOKIE = 'mx_prefs';

/** Parse untrusted input (cookie/DB/json) into valid preferences, falling back per field. */
export function parsePrefs(input: unknown): Prefs {
  if (!input || typeof input !== 'object') return DEFAULT_PREFS;
  const full = prefsSchema.safeParse(input);
  if (full.success) return full.data;
  // Keep valid fields, reset invalid ones.
  const out: Record<string, unknown> = { ...DEFAULT_PREFS };
  const shape = prefsSchema.shape;
  for (const [key, schema] of Object.entries(shape)) {
    const r = (schema as z.ZodType).safeParse((input as Record<string, unknown>)[key]);
    if (r.success) out[key] = r.data;
  }
  return prefsSchema.parse(out);
}

function toBase64Url(s: string): string {
  // Preference JSON is ASCII-only, so btoa (available in Node and browsers) is safe.
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

/** Only store fields that differ from the defaults to keep the cookie small. */
export function encodePrefsCookie(prefs: Prefs): string {
  const diff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prefs)) {
    if (JSON.stringify(DEFAULT_PREFS[k as keyof Prefs]) !== JSON.stringify(v)) diff[k] = v;
  }
  return toBase64Url(JSON.stringify(diff));
}

export function decodePrefsCookie(value: string | undefined | null): Prefs {
  if (!value || value.length > 2048) return DEFAULT_PREFS;
  try {
    return parsePrefs({ ...DEFAULT_PREFS, ...JSON.parse(fromBase64Url(value)) });
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Attributes applied to <html>. Every value is from a closed enum, so it is safe to render. */
export function prefsToHtmlAttributes(prefs: Prefs): Record<string, string> {
  return {
    'data-scheme': prefs.colorScheme,
    'data-contrast': prefs.contrast,
    'data-font': prefs.font,
    'data-letter-spacing': prefs.letterSpacing,
    'data-line-height': prefs.lineHeight,
    'data-motion': prefs.motion,
    'data-animated-images': prefs.animatedImages ? 'on' : 'off',
    'data-underline-links': prefs.underlineLinks ? 'on' : 'off',
    'data-cb-roles': prefs.colorblindRoleColors ? 'on' : 'off',
    'data-density': prefs.density,
    'data-simplified': prefs.simplifiedLayout ? 'on' : 'off',
    'data-focus': prefs.focusRing,
  };
}
