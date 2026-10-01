import { NextResponse, type NextRequest } from 'next/server';

function origin(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** Per-request CSP nonce plus baseline security headers. */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';
  const media = origin(process.env.MEDIA_BASE_URL);
  const rt = origin(process.env.NEXT_PUBLIC_REALTIME_URL);
  const rtWs = rt.replace(/^http/, 'ws');
  // Voice calls connect to LiveKit (over WebSocket, and HTTP when it checks why a connect failed).
  const lk = origin(process.env.LIVEKIT_URL);
  const voice = lk ? ` ${lk} ${lk.replace(/^ws/, 'http')}` : '';
  // Turnstile (the sign-in, sign-up and vote checks) loads a script and runs in an iframe.
  const turnstile = process.env.TURNSTILE_SITE_KEY ? ' https://challenges.cloudflare.com' : '';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstile}${dev ? " 'unsafe-eval'" : ''}`,
    // Community themes are emitted as validated inline <style>; Radix also sets inline styles.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${media}`.trim(),
    `media-src 'self' blob: ${media}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' ${rt} ${rtWs}${voice}${dev ? ' ws: http://localhost:*' : ''}`.trim(),
    `frame-src https://www.youtube-nocookie.com https://player.twitch.tv${turnstile}`,
    // The service worker (push notifications) is our own script at /sw.js.
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  // The microphone and screen sharing are for voice channels, on this site only.
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(self), display-capture=(self), geolocation=()',
  );
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  return response;
}

export const config = {
  matcher: [
    {
      // Uploads skip it: the proxy would otherwise buffer a copy of every file in memory.
      source: '/((?!_next/static|_next/image|favicon.ico|media/|api/health|api/uploads).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
