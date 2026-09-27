import type { Prefs } from './prefs';

// Kept free of zod so the prefs code every page needs in the browser stays small. The schema in
// prefs.ts validates input; a unit test checks its defaults match DEFAULT_PREFS.

export const FONT_SCALES = [87, 100, 112, 125, 150, 175, 200] as const;

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
  density: 'comfortable',
  timeFormat: 'auto',
  simplifiedLayout: false,
  communityThemes: true,
  focusRing: 'default',
  chatAnnouncements: 'mentions',
  liveUpdates: 'auto',
  shortcuts: true,
  singleKeyShortcuts: true,
  requireAltTextReminder: true,
  keymap: {},
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
    'data-density': prefs.density,
    'data-simplified': prefs.simplifiedLayout ? 'on' : 'off',
    'data-focus': prefs.focusRing,
  };
}
