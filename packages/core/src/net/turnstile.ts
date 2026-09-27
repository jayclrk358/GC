import { env } from '../env';
import { logger } from '../logger';

const log = logger('turnstile');

export function turnstileEnabled(): boolean {
  return Boolean(env().TURNSTILE_SECRET_KEY && env().TURNSTILE_SITE_KEY);
}

/**
 * Check a Cloudflare Turnstile token. With no keys configured the check is skipped (local
 * development and self-hosters who don't want a CAPTCHA).
 */
export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch(env().TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'turnstile verification failed');
    return false;
  }
}
