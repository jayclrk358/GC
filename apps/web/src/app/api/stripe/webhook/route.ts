import { handleStripeWebhook, isAppError, logger } from '@magnox/core';

/**
 * Stripe webhooks (subscriptions starting, renewing, changing and ending). The raw body is
 * needed to check Stripe's signature, so this reads text rather than JSON.
 */
export async function POST(req: Request) {
  const payload = await req.text();
  try {
    const result = await handleStripeWebhook(payload, req.headers.get('stripe-signature'));
    return Response.json({ received: true, ...result });
  } catch (e) {
    if (isAppError(e)) return Response.json({ error: e.message }, { status: e.status });
    logger('stripe').error({ err: e }, 'webhook failed');
    // A 500 makes Stripe retry later.
    return Response.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
