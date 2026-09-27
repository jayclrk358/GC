'use client';

import * as React from 'react';
import Script from 'next/script';

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      theme?: 'auto' | 'light' | 'dark';
      size?: 'normal' | 'flexible' | 'compact';
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ): string;
  reset(id?: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** Tokens work once: call after a failed submit to get a fresh challenge. */
  reset(): void;
}

/**
 * Cloudflare Turnstile ("are you human?") check. Reports its token through `onToken` (null when
 * it expires or fails). Only rendered when Turnstile is configured.
 */
export const Turnstile = React.forwardRef<
  TurnstileHandle,
  { siteKey: string; action?: string; onToken: (token: string | null) => void }
>(function Turnstile({ siteKey, action, onToken }, ref) {
  const box = React.useRef<HTMLDivElement>(null);
  const widget = React.useRef<string | null>(null);
  const tokenCallback = React.useRef(onToken);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    tokenCallback.current = onToken;
  });

  React.useEffect(() => {
    if (!loaded || !box.current || !window.turnstile) return;
    const id = window.turnstile.render(box.current, {
      sitekey: siteKey,
      action,
      theme: 'auto',
      size: 'flexible',
      callback: (token) => tokenCallback.current(token),
      'expired-callback': () => tokenCallback.current(null),
      'error-callback': () => tokenCallback.current(null),
    });
    widget.current = id;
    return () => {
      window.turnstile?.remove(id);
      widget.current = null;
    };
  }, [loaded, siteKey, action]);

  React.useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        tokenCallback.current(null);
        if (widget.current) window.turnstile?.reset(widget.current);
      },
    }),
    [],
  );

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setLoaded(true)}
      />
      <div ref={box} className="min-h-[65px]" data-testid="turnstile" />
    </>
  );
});
