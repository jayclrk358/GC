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

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Community themes are emitted as validated inline <style>; Radix also sets inline styles.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${media}`.trim(),
    `media-src 'self' ${media}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' ${rt} ${rtWs}${dev ? ' ws: http://localhost:*' : ''}`.trim(),
    // Turnstile (vote CAPTCHA) runs its challenge in an iframe, when it's configured.
    `frame-src https://www.youtube-nocookie.com https://player.twitch.tv${process.env.TURNSTILE_SITE_KEY ? ' https://challenges.cloudflare.com' : ''}`,
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
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|media/|api/health).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
