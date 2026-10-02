import { z } from 'zod';

// The public API and webhooks.

export const API_SCOPES = ['read', 'write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const apiTokenInputSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(60),
  /** Also let it post (as you). */
  write: z.boolean().default(false),
});

export const WEBHOOK_EVENTS = [
  'member.joined',
  'member.left',
  'message.created',
  'thread.created',
  'post.created',
  'announcement.created',
  'event.created',
  'application.submitted',
  'server.down',
  'server.up',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

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
export const SIGNATURE_HEADER = 'x-magnox-signature';
