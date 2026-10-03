'use client';

import * as React from 'react';
import type { Prefs } from '@gamecentral/shared';
// The zod-free module: this provider is on every page, so it must not pull in the schemas.
import {
  encodePrefsCookie,
  PREFS_COOKIE,
  prefsToHtmlAttributes,
} from '@gamecentral/shared/prefs-values';
import { savePrefs } from '@/app/actions/prefs';
import { configureSounds, unlockSoundsOnInteraction } from '@/lib/sounds';

interface PrefsContextValue {
  prefs: Prefs;
  /** Apply immediately (live preview) without saving. */
  preview: (prefs: Prefs) => void;
  /** Apply and persist. Returns false if saving failed. */
  save: (prefs: Prefs) => Promise<boolean>;
}

const PrefsContext = React.createContext<PrefsContextValue | null>(null);

export function applyPrefsToDocument(prefs: Prefs) {
  const html = document.documentElement;
  for (const [k, v] of Object.entries(prefsToHtmlAttributes(prefs))) html.setAttribute(k, v);
  html.style.fontSize = `${prefs.fontScale}%`;
}

/**
 * Write the preference cookie in the browser straight away so a change survives an immediate
 * reload. Display preferences aren't sensitive, so the cookie is readable by scripts.
 */
function writePrefsCookie(prefs: Prefs) {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${PREFS_COOKIE}=${encodePrefsCookie(prefs)}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${secure}`;
}

export function PrefsProvider({
  initial,
  children,
}: {
  initial: Prefs;
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = React.useState(initial);
  const [lastInitial, setLastInitial] = React.useState(initial);
  // Adopt fresh server preferences (e.g. after router.refresh()) without an effect. Every
  // refresh sends a new object, so compare contents: otherwise everything using the preferences
  // (the whole chat, for one) would re-render on each refresh for no change.
  if (initial !== lastInitial && JSON.stringify(initial) !== JSON.stringify(lastInitial)) {
    setLastInitial(initial);
    setPrefs(initial);
  }

  // Sound effects play from outside React (sockets, voice): keep them told what's wanted.
  React.useEffect(() => configureSounds(prefs), [prefs]);
  React.useEffect(() => unlockSoundsOnInteraction(), []);

  const preview = React.useCallback((p: Prefs) => applyPrefsToDocument(p), []);
  const save = React.useCallback(async (p: Prefs) => {
    applyPrefsToDocument(p);
    writePrefsCookie(p);
    setPrefs(p);
    const res = await savePrefs(p);
    return res.ok;
  }, []);

  const value = React.useMemo(() => ({ prefs, preview, save }), [prefs, preview, save]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = React.useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}
