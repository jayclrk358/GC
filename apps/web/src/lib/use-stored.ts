'use client';

import * as React from 'react';

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function read(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback; // Storage blocked (private windows, some browsers' settings).
  }
}

/**
 * A small string remembered in this browser, kept in step between components (and tabs).
 * The server, and the first render, see `fallback`.
 */
export function useStored(key: string, fallback: string): [string, (value: string) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = React.useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked: nothing to remember it in.
      }
      for (const l of listeners) l();
    },
    [key],
  );
  return [value, set];
}
