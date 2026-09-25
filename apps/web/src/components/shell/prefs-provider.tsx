'use client';

import * as React from 'react';
import { prefsToHtmlAttributes, type Prefs } from '@magnox/shared';
import { savePrefs } from '@/app/actions/prefs';

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

export function PrefsProvider({
  initial,
  children,
}: {
  initial: Prefs;
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = React.useState(initial);
  const [lastInitial, setLastInitial] = React.useState(initial);
  // Adopt fresh server preferences (e.g. after router.refresh()) without an effect.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setPrefs(initial);
  }

  const preview = React.useCallback((p: Prefs) => applyPrefsToDocument(p), []);
  const save = React.useCallback(async (p: Prefs) => {
    applyPrefsToDocument(p);
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
