import 'server-only';
import { connection } from 'next/server';
import { env, turnstileEnabled } from '@gamecentral/core';

/**
 * The public Turnstile site key, or null when the check is off. Read per request so a key set
 * after the image was built still takes effect.
 */
export async function turnstileSiteKey(): Promise<string | null> {
  await connection();
  return turnstileEnabled() ? env().TURNSTILE_SITE_KEY : null;
}
