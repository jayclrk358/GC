'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/components/shell/prefs-provider';

// Shared by every live component on the page, so two reasons to refresh at once cause one.
let lastRefresh = 0;
const GAP = 2000;

function refreshOnce(router: ReturnType<typeof useRouter>) {
  if (Date.now() - lastRefresh < GAP) return;
  lastRefresh = Date.now();
  router.refresh();
}

/** Whether content may update in place (the reader hasn't asked to be told first instead). */
export function useAutoUpdates(): boolean {
  return usePrefs().prefs.liveUpdates === 'auto';
}

/**
 * Re-render the page with fresh server data, keeping client state, focus and scroll position.
 * Bursts of events cause one refresh; while the tab is hidden it waits until it's visible again.
 */
export function useLiveRefresh(delay = 1000): () => void {
  const router = useRouter();
  const timer = React.useRef<number | undefined>(undefined);
  const stale = React.useRef(false);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !stale.current) return;
      stale.current = false;
      refreshOnce(router);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(timer.current);
    };
  }, [router]);

  return React.useCallback(() => {
    const fire = () => {
      if (document.visibilityState === 'hidden') {
        stale.current = true;
        return;
      }
      // Just refreshed for another reason: that render may predate this change, so go again.
      const wait = lastRefresh + GAP - Date.now();
      if (wait > 0) timer.current = window.setTimeout(fire, wait);
      else refreshOnce(router);
    };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fire, delay);
  }, [router, delay]);
}

/**
 * Keep a page current without a reload: refresh every `every` seconds while it's visible, and
 * straight away when the reader comes back after being away longer than that.
 */
export function useAutoRefresh(every: number | null, away: number): void {
  const router = useRouter();
  const auto = useAutoUpdates();
  React.useEffect(() => {
    if (!auto) return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > away * 1000) refreshOnce(router);
    };
    document.addEventListener('visibilitychange', onVisibility);
    const id = every
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') refreshOnce(router);
        }, every * 1000)
      : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(id);
    };
  }, [auto, router, every, away]);
}
