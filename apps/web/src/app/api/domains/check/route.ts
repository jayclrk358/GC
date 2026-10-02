import { communityForDomain } from '@magnox/core';

/**
 * Is this a community's verified domain? Caddy asks before getting a certificate for a domain
 * (on-demand TLS: 200 means yes), and the proxy asks to route requests on it.
 */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get('domain') ?? '';
  const slug = domain ? await communityForDomain(domain).catch(() => null) : null;
  return slug
    ? Response.json({ slug }, { headers: { 'cache-control': 'no-store' } })
    : Response.json({ error: 'Unknown domain' }, { status: 404 });
}
