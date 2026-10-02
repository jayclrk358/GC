import { z } from 'zod';
import { LOCALES } from './locales';
import {
  DEFAULT_PREFS,
  FONT_SCALES,
  fromBase64Url,
  SOUND_CHOICES,
  SOUND_EVENTS,
  SOUND_PACKS,
} from './prefs-values';

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
  /** Role name effects (gradients, glows, animations). Off shows plain names. */
  nameEffects: z.boolean().default(true),
  density: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
  timeFormat: z.enum(['auto', '12h', '24h']).default('auto'),
  /** The interface language; "auto" follows the browser. */
  language: z.enum(['auto', ...LOCALES]).default('auto'),
  simplifiedLayout: z.boolean().default(false),
  communityThemes: z.boolean().default(true),
  focusRing: z.enum(['default', 'bold']).default('default'),
  chatAnnouncements: z.enum(['all', 'mentions', 'off']).default('mentions'),
  /** New posts, replies and page updates: show them straight away, or announce and wait. */
  liveUpdates: z.enum(['auto', 'announce']).default('auto'),
  shortcuts: z.boolean().default(true),
  singleKeyShortcuts: z.boolean().default(true),
  requireAltTextReminder: z.boolean().default(true),
  /** Remapped keyboard shortcuts: shortcut id → key combo (e.g. "mod+k", "?", "g h"). */
  keymap: z
    .record(z.string().regex(/^[a-z-]{1,32}$/), z.string().max(24))
    .refine((m) => Object.keys(m).length <= 40)
    .default({}),
  /** Sound effects for notifications, voice and a few actions. */
  sounds: z.boolean().default(true),
  soundPack: z.enum(SOUND_PACKS).default('magnox'),
  soundVolume: z.number().int().min(0).max(100).default(60),
  /** Events changed from their defaults (see soundForEvent). */
  soundEvents: z.partialRecord(z.enum(SOUND_EVENTS), z.enum(SOUND_CHOICES)).default({}),
});

export type Prefs = z.infer<typeof prefsSchema>;

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

export function decodePrefsCookie(value: string | undefined | null): Prefs {
  if (!value || value.length > 2048) return DEFAULT_PREFS;
  try {
    return parsePrefs({ ...DEFAULT_PREFS, ...JSON.parse(fromBase64Url(value)) });
  } catch {
    return DEFAULT_PREFS;
  }
}
