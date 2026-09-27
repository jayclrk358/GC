import 'server-only';
import { headers } from 'next/headers';

/**
 * The visitor's IP address as reported by the reverse proxy (Caddy sets X-Forwarded-For). Only
 * used for abuse limits, never stored.
 */
export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
}
