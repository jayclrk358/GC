import { handleVoiceWebhook, logger } from '@magnox/core';

/**
 * LiveKit's webhook: people joining and leaving voice channels, which keeps the "who's in
 * voice" lists current. LiveKit signs each call with the API secret (checked in core).
 */
export async function POST(req: Request) {
  const body = await req.text();
  try {
    await handleVoiceWebhook(body, req.headers.get('authorization'));
    return new Response(null, { status: 204 });
  } catch (err) {
    logger('voice').warn({ err: (err as Error).message }, 'voice webhook rejected');
    return new Response('Invalid webhook', { status: 400 });
  }
}
