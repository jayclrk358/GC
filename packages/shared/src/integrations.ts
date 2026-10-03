import { z } from 'zod';
import { WEBHOOK_EVENTS } from './integrations-values';

// The public API and webhooks.
// The webhook event list is in integrations-values.ts, which client code imports directly.

export * from './integrations-values';

export const API_SCOPES = ['read', 'write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const apiTokenInputSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(60),
  /** Also let it post (as you). */
  write: z.boolean().default(false),
});

/** A Discord channel webhook (Server Settings → Integrations → Webhooks → Copy Webhook URL). */
const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;

export function isDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url.trim());
}

export const webhookInputSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(60),
  url: z.string().trim().url('Enter a full address, starting with https://').max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Choose at least one thing to send.'),
});

/** A webhook delivery's signature header: `sha256=` and the hex HMAC of the body. */
export const SIGNATURE_HEADER = 'x-gamecentral-signature';
