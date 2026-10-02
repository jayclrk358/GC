import type { Prefs } from './prefs';

// Kept free of zod so the prefs code every page needs in the browser stays small. The schema in
// prefs.ts validates input; a unit test checks its defaults match DEFAULT_PREFS.

export const FONT_SCALES = [87, 100, 112, 125, 150, 175, 200] as const;

/** Sets of sound effects, all made in the browser (no audio files). */
export const SOUND_PACKS = ['magnox', 'soft', 'arcade', 'crystal'] as const;
export type SoundPack = (typeof SOUND_PACKS)[number];

/** What sounds can be set for. Some play one of two cues (joining or leaving, say). */
export const SOUND_EVENTS = [
  'mention',
  'notification',
  'message',
  'send',
  'voiceSelf',
  'voiceOthers',
  'mute',
  'deafen',
  'celebrate',
] as const;
export type SoundEvent = (typeof SOUND_EVENTS)[number];

/** Events that make a sound unless turned off. The rest (every message, sending) are opt-in. */
export const SOUND_EVENTS_ON: ReadonlySet<SoundEvent> = new Set<SoundEvent>([
  'mention',
  'notification',
  'voiceSelf',
  'voiceOthers',
  'mute',
  'deafen',
  'celebrate',
]);

/** A change from an event's default: off, on (the pack's sound), or another pack's sound. */
export type SoundChoice = 'off' | 'on' | SoundPack;
export const SOUND_CHOICES = ['off', 'on', ...SOUND_PACKS] as const;

/** Which pack's sound an event plays, or null for none. */
export function soundForEvent(
  prefs: Pick<Prefs, 'sounds' | 'soundPack' | 'soundVolume' | 'soundEvents'>,
  event: SoundEvent,
): SoundPack | null {
  if (!prefs.sounds || prefs.soundVolume <= 0) return null;
  const choice = prefs.soundEvents[event];
  if (choice === 'off') return null;
  if (choice === 'on') return prefs.soundPack;
  if (choice) return choice;
  return SOUND_EVENTS_ON.has(event) ? prefs.soundPack : null;
}

export const DEFAULT_PREFS: Prefs = {
  v: 1,
  colorScheme: 'system',
  contrast: 'normal',
  fontScale: 100,
  font: 'default',
  letterSpacing: 'normal',
  lineHeight: 'normal',
  motion: 'system',
  autoplayMedia: false,
  animatedImages: true,
  underlineLinks: false,
  colorblindRoleColors: false,
  nameEffects: true,
  density: 'comfortable',
  timeFormat: 'auto',
  language: 'auto',
  simplifiedLayout: false,
  communityThemes: true,
  focusRing: 'default',
  chatAnnouncements: 'mentions',
  liveUpdates: 'auto',
  shortcuts: true,
  singleKeyShortcuts: true,
  requireAltTextReminder: true,
  keymap: {},
  sounds: true,
  soundPack: 'magnox',
  soundVolume: 60,
  soundEvents: {},
};

export const PREFS_COOKIE = 'mx_prefs';

function toBase64Url(s: string): string {
  // Preference JSON is ASCII-only, so btoa (available in Node and browsers) is safe.
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): string {
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
    'data-name-effects': prefs.nameEffects ? 'on' : 'off',
    'data-density': prefs.density,
    'data-simplified': prefs.simplifiedLayout ? 'on' : 'off',
    'data-focus': prefs.focusRing,
  };
}
