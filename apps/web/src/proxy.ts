import { NextResponse, type NextRequest } from 'next/server';
import { customDomainRoute } from '@magnox/shared';

function origin(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
const appHost = (() => {
  try {
    return new URL(appUrl).host.toLowerCase();
  } catch {
    return '';
  }
})();

/** Communities' own domains → their slug (null: not one), remembered for a minute. */
const domains = new Map<string, { slug: string | null; at: number }>();

async function slugForDomain(host: string): Promise<string | null> {
  const hit = domains.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.slug;
  let slug: string | null = null;
  try {
    const r = await fetch(
      `http://127.0.0.1:${process.env.PORT ?? 3000}/api/domains/check?domain=${encodeURIComponent(host)}`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (r.ok) slug = ((await r.json()) as { slug?: string }).slug ?? null;
  } catch {
    return null;
  }
  domains.set(host, { slug, at: Date.now() });
  if (domains.size > 2000) domains.delete(domains.keys().next().value!);
  return slug;
}

/**
 * A host that could be a community's domain: a well-formed domain name that isn't this site, an
 * IP or an internal name. Anything else isn't looked up at all.
 */
function maybeCustomDomain(host: string): boolean {
  const name = host.replace(/:\d+$/, '').replace(/\.$/, '');
  return (
    Boolean(appHost) &&
    host !== appHost &&
    name.length <= 253 &&
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name) &&
    !/^[\d.]+$/.test(name) &&
    !name.endsWith('.localhost')
  );
}

/** A link prefetch: it needs no nonce or headers, and has no body to cap. */
function isPrefetch(request: NextRequest): boolean {
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch')
  );
}

/** Per-request CSP nonce plus baseline security headers. */
export async function proxy(request: NextRequest) {
  if (isPrefetch(request)) return NextResponse.next();
  // A community's own domain shows its pages; everything else is on the main site.
  const host = (request.headers.get('host') ?? '').toLowerCase();
  let rewrite: string | null = null;
  if (maybeCustomDomain(host)) {
    const slug = await slugForDomain(host.replace(/:\d+$/, ''));
    if (slug) {
      const route = customDomainRoute(request.nextUrl.pathname, slug);
      if (route.kind === 'redirect') {
        return NextResponse.redirect(
          new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, appUrl),
          307,
        );
      }
      if (route.kind === 'rewrite') rewrite = route.path;
    }
  }

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
  requestHeaders.set('x-pathname', rewrite ?? request.nextUrl.pathname);

  const response = rewrite
    ? NextResponse.rewrite(new URL(`${rewrite}${request.nextUrl.search}`, request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
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
      // Prefetches aren't left out here (a matcher can't tell a GET from a POST, and anyone can
      // send the headers): proxy() lets GET prefetches through itself.
      source: '/((?!_next/static|_next/image|favicon.ico|media/|api/health|api/uploads).*)',
    },
  ],
};
