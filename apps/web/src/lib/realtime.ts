'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
const refCounts = new Map<string, number>();

/** One shared Socket.IO connection per tab, created lazily. */
export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_REALTIME_URL || undefined;
    socket = io(url, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    // Re-join rooms after reconnects (the server forgets subscriptions).
    socket.on('connect', () => {
      for (const room of refCounts.keys()) socket!.emit('subscribe', room);
    });
    // Access to a room was taken away (removed from the community, say): don't re-join it.
    socket.on('room:revoked', (p: { room?: unknown } | null) => {
      if (typeof p?.room === 'string') refCounts.delete(p.room);
    });
  }
  return socket;
}

function subscribe(room: string) {
  const n = refCounts.get(room) ?? 0;
  refCounts.set(room, n + 1);
  const s = getSocket();
  if (n === 0 && s.connected) s.emit('subscribe', room);
}

function unsubscribe(room: string) {
  const n = (refCounts.get(room) ?? 1) - 1;
  if (n <= 0) {
    refCounts.delete(room);
    getSocket().emit('unsubscribe', room);
  } else refCounts.set(room, n);
}

type Handlers = Record<string, (payload: never) => void>;

/**
 * Subscribe to a room while mounted and listen for events. Events are filtered by the caller
 * (payloads carry ids) because a socket receives events for every room it has joined.
 */
export function useRoom(room: string | null, handlers: Handlers): void {
  const ref = React.useRef(handlers);
  React.useEffect(() => {
    ref.current = handlers;
  });
  React.useEffect(() => {
    if (!room) return;
    const s = getSocket();
    subscribe(room);
    const names = Object.keys(ref.current);
    const listeners = names.map((name) => {
      const fn = (payload: unknown) =>
        (ref.current[name] as ((p: unknown) => void) | undefined)?.(payload);
      s.on(name, fn);
      return [name, fn] as const;
    });
    return () => {
      for (const [name, fn] of listeners) s.off(name, fn);
      unsubscribe(room);
    };
  }, [room]);
}

/**
 * Listen for events delivered to this user's own room, which every signed-in socket joins on
 * connect (notifications, removals). No subscription needed.
 */
export function useUserEvents(handlers: Handlers, enabled = true): void {
  const ref = React.useRef(handlers);
  React.useEffect(() => {
    ref.current = handlers;
  });
  React.useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    const listeners = Object.keys(ref.current).map((name) => {
      const fn = (payload: unknown) =>
        (ref.current[name] as ((p: unknown) => void) | undefined)?.(payload);
      s.on(name, fn);
      return [name, fn] as const;
    });
    return () => {
      for (const [name, fn] of listeners) s.off(name, fn);
    };
  }, [enabled]);
}

/** Subscribe to several rooms at once (e.g. every chat channel in the sidebar). */
export function useRooms(roomList: string[], handlers: Handlers): void {
  const ref = React.useRef(handlers);
  React.useEffect(() => {
    ref.current = handlers;
  });
  const key = roomList.join(',');
  React.useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.length) return;
    const s = getSocket();
    list.forEach(subscribe);
    const listeners = Object.keys(ref.current).map((name) => {
      const fn = (payload: unknown) =>
        (ref.current[name] as ((p: unknown) => void) | undefined)?.(payload);
      s.on(name, fn);
      return [name, fn] as const;
    });
    return () => {
      for (const [name, fn] of listeners) s.off(name, fn);
      list.forEach(unsubscribe);
    };
  }, [key]);
}

/** Run a callback whenever the socket reconnects (to refetch what was missed). */
export function useReconnect(fn: () => void): void {
  const ref = React.useRef(fn);
  React.useEffect(() => {
    ref.current = fn;
  });
  React.useEffect(() => {
    const s = getSocket();
    let first = true;
    const onConnect = () => {
      if (first && s.connected) {
        first = false;
        return;
      }
      ref.current();
    };
    // The initial connect isn't a reconnect.
    if (s.connected) first = false;
    s.on('connect', onConnect);
    return () => {
      s.off('connect', onConnect);
    };
  }, []);
}

/** Send an ephemeral event (typing indicators). */
export function emitSocket(event: string, payload: unknown): void {
  const s = getSocket();
  if (s.connected) s.emit(event, payload);
}
