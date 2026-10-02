// Kept free of zod so the webhook manager stays small in the browser. The schemas in
// integrations.ts validate input.

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
