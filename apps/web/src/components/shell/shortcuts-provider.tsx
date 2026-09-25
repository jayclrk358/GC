'use client';

import * as React from 'react';
import { eventToCombo, isSingleKey, isTypingTarget, SHORTCUTS } from '@/lib/shortcuts';
import { usePrefs } from './prefs-provider';

type Handler = () => void;

interface ShortcutsContextValue {
  register: (id: string, handler: Handler) => () => void;
  combos: Record<string, string>;
}

const Ctx = React.createContext<ShortcutsContextValue | null>(null);

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = usePrefs();
  const handlers = React.useRef(new Map<string, Handler>());
  const pending = React.useRef<{ key: string; at: number } | null>(null);

  const combos = React.useMemo(
    () => Object.fromEntries(SHORTCUTS.map((s) => [s.id, prefs.keymap[s.id] ?? s.keys])),
    [prefs.keymap],
  );

  React.useEffect(() => {
    if (!prefs.shortcuts) return;
    const entries = Object.entries(combos);
    const firstSteps = new Set(
      entries
        .map(([, k]) => k.split(' '))
        .filter((s) => s.length === 2)
        .map((s) => s[0]),
    );

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const combo = eventToCombo(e);
      if (!combo) return;
      const typing = isTypingTarget(e.target);
      const now = Date.now();
      const prev = pending.current;
      pending.current = null;

      for (const [id, keys] of entries) {
        const handler = handlers.current.get(id);
        if (!handler) continue;
        const single = isSingleKey(keys);
        if (typing && single) continue;
        if (single && !prefs.singleKeyShortcuts) continue;
        const steps = keys.split(' ');
        const matches =
          (steps.length === 1 && steps[0] === combo) ||
          (steps.length === 2 &&
            prev !== null &&
            prev.key === steps[0] &&
            now - prev.at < 1200 &&
            steps[1] === combo);
        if (matches) {
          e.preventDefault();
          handler();
          return;
        }
      }
      if (!typing && prefs.singleKeyShortcuts && firstSteps.has(combo)) {
        pending.current = { key: combo, at: now };
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [combos, prefs.shortcuts, prefs.singleKeyShortcuts]);

  const register = React.useCallback((id: string, handler: Handler) => {
    handlers.current.set(id, handler);
    return () => {
      if (handlers.current.get(id) === handler) handlers.current.delete(id);
    };
  }, []);

  const value = React.useMemo(() => ({ register, combos }), [register, combos]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShortcut(id: string, handler: Handler) {
  const ctx = React.useContext(Ctx);
  const ref = React.useRef(handler);
  React.useEffect(() => {
    ref.current = handler;
  });
  React.useEffect(() => ctx?.register(id, () => ref.current()), [ctx, id]);
}

export function useShortcutCombos(): Record<string, string> {
  return React.useContext(Ctx)?.combos ?? {};
}
