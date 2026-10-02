'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { getSocket } from '@/lib/realtime';
import { cn } from '@/lib/utils';

export type PresenceStatus = 'online' | 'idle' | 'offline';

// One watch list per tab: avatars on screen register the people they show, and the realtime
// server pushes their status as it changes.
const statuses = new Map<string, PresenceStatus>();
const listeners = new Set<() => void>();
const counts = new Map<string, number>();
let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let wired = false;

function notify() {
  for (const l of listeners) l();
}

function watch(ids: string[]) {
  const s = getSocket();
  if (!s.connected) return; // Watched again on connect.
  for (let i = 0; i < ids.length; i += 200) {
    s.emit('presence:watch', ids.slice(i, i + 200), (res: Record<string, PresenceStatus>) => {
      for (const [id, status] of Object.entries(res)) statuses.set(id, status);
      notify();
    });
  }
}

function wire() {
  if (wired) return;
  wired = true;
  const s = getSocket();
  s.on('presence', (p: { userId: string; status: PresenceStatus }) => {
    statuses.set(p.userId, p.status);
    notify();
  });
  s.on('connect', () => {
    if (counts.size) watch([...counts.keys()]);
  });
}

function flush() {
  flushTimer = null;
  const ids = [...pending];
  pending = new Set();
  if (ids.length) watch(ids);
}

function retain(id: string) {
  wire();
  const n = counts.get(id) ?? 0;
  counts.set(id, n + 1);
  if (n === 0) {
    pending.add(id);
    flushTimer ??= setTimeout(flush, 50);
  }
}

function release(id: string) {
  const n = (counts.get(id) ?? 1) - 1;
  if (n > 0) {
    counts.set(id, n);
    return;
  }
  counts.delete(id);
  // Keep following for a moment in case the avatar comes straight back (navigation).
  setTimeout(() => {
    if (counts.has(id)) return;
    statuses.delete(id);
    const s = getSocket();
    if (s.connected) s.emit('presence:unwatch', [id]);
  }, 10_000);
}

function subscribeStore(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Someone's status, kept up to date while the component is mounted (null until known). */
export function usePresence(userId: string | null | undefined): PresenceStatus | null {
  React.useEffect(() => {
    if (!userId) return;
    retain(userId);
    return () => release(userId);
  }, [userId]);
  return React.useSyncExternalStore(
    subscribeStore,
    () => (userId ? (statuses.get(userId) ?? null) : null),
    () => null,
  );
}

/**
 * The status dot on an avatar: green online, orange idle, red (a ring) offline. It has a label
 * for screen readers unless the surrounding content is noisy enough without it (chat).
 */
export function PresenceDot({
  userId,
  labelled = true,
  className,
}: {
  userId: string;
  labelled?: boolean;
  className?: string;
}) {
  const t = useTranslations('presence');
  const status = usePresence(userId);
  if (!status) return null;
  return (
    <span
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? t(status) : undefined}
      aria-hidden={labelled ? undefined : true}
      title={t(status)}
      data-presence={status}
      className={cn('mx-presence', className)}
    />
  );
}

const IDLE_AFTER_MS = 3 * 60_000;
// Not sooner: switching tabs for a moment shouldn't flip the dot (and tell everyone watching).
const HIDDEN_IDLE_MS = 5 * 60_000;

/**
 * Tells the realtime server whether this tab is in use: idle after a few minutes without input,
 * or a few minutes after the tab is hidden; active again on the next input.
 */
export function ActivityTracker() {
  React.useEffect(() => {
    const s = getSocket();
    let state: 'active' | 'idle' = 'active';
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let lastInput = 0;
    const set = (next: 'active' | 'idle') => {
      if (next === state) return;
      state = next;
      if (s.connected) s.emit('presence:state', next);
    };
    const arm = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => set('idle'), IDLE_AFTER_MS);
    };
    const onInput = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (state === 'active' && now - lastInput < 1000) return;
      lastInput = now;
      set('active');
      arm();
    };
    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      if (document.visibilityState === 'hidden') {
        hiddenTimer = setTimeout(() => set('idle'), HIDDEN_IDLE_MS);
      } else onInput();
    };
    // A new connection starts out active on the server; correct it if we're idle.
    const onConnect = () => {
      if (state === 'idle') s.emit('presence:state', 'idle');
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];
    for (const e of events) window.addEventListener(e, onInput, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    s.on('connect', onConnect);
    arm();
    return () => {
      for (const e of events) window.removeEventListener(e, onInput);
      document.removeEventListener('visibilitychange', onVisibility);
      s.off('connect', onConnect);
      clearTimeout(idleTimer);
      clearTimeout(hiddenTimer);
    };
  }, []);
  return null;
}
