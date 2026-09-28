/**
 * A stand-in for Stripe, served by the fixture control server (set STRIPE_API_URL to
 * http://127.0.0.1:25591 in the app). It implements just the API calls Magnox makes, plus a
 * fake Checkout page and billing portal that send signed webhooks back like Stripe does.
 *
 *   Prices (use these as the STRIPE_PRICE_* values): price_plus_month, price_plus_year,
 *   price_pro_month, price_pro_year
 *   GET /stripe/state   every customer, session and subscription (for tests)
 *
 * Webhooks go to STRIPE_WEBHOOK_URL (default http://localhost:3000/api/stripe/webhook), signed
 * with STRIPE_WEBHOOK_SECRET (default whsec_fixture).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';

const WEBHOOK_URL = process.env.STRIPE_WEBHOOK_URL ?? 'http://localhost:3000/api/stripe/webhook';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_fixture';
const SELF = `http://127.0.0.1:${process.env.FAKE_CTL_PORT ?? 25591}`;

type Obj = Record<string, unknown>;

const PRICES: Record<string, Obj> = Object.fromEntries(
  (
    [
      ['price_plus_month', 499, 'month'],
      ['price_plus_year', 4990, 'year'],
      ['price_pro_month', 999, 'month'],
      ['price_pro_year', 9990, 'year'],
    ] as const
  ).map(([id, amount, interval]) => [
    id,
    { id, object: 'price', unit_amount: amount, currency: 'usd', recurring: { interval } },
  ]),
);

const customers = new Map<string, Obj>();
const sessions = new Map<string, Obj>();
const subscriptions = new Map<string, Obj>();

const id = (prefix: string) => `${prefix}_fx${randomBytes(8).toString('hex')}`;
const now = () => Math.floor(Date.now() / 1000);

/** Stripe's form encoding (a[b][0][c]=v) back into nested objects. */
function parseForm(body: string): Obj {
  const out: Obj = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, '').split('[');
    let node = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) node[part] = value;
      else node = (node[part] ??= {}) as Obj;
    });
  }
  return out;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

function notFound(res: ServerResponse) {
  json(res, 404, { error: { type: 'invalid_request_error', message: 'No such object' } });
}

async function sendWebhook(type: string, object: Obj) {
  const payload = JSON.stringify({
    id: id('evt'),
    object: 'event',
    type,
    created: now(),
    livemode: false,
    api_version: '2026-08-26.dahlia',
    data: { object },
  });
  const t = now();
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${signature}` },
      body: payload,
    });
  } catch {
    // The app may not be running; Stripe would retry, tests don't need to.
  }
}

function setPrice(sub: Obj, priceId: string) {
  const items = sub.items as { data: Obj[] };
  const item = items.data[0]!;
  item.price = PRICES[priceId];
}

function newSubscription(session: Obj): Obj {
  const lineItems = session.line_items as Record<string, Obj>;
  const priceId = String(lineItems['0']?.price);
  const subData = (session.subscription_data ?? {}) as Obj;
  const period = PRICES[priceId]?.recurring as { interval: string } | undefined;
  const sub: Obj = {
    id: id('sub'),
    object: 'subscription',
    customer: session.customer,
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    created: now(),
    metadata: (subData.metadata as Obj) ?? {},
    items: {
      object: 'list',
      data: [
        {
          id: id('si'),
          object: 'subscription_item',
          quantity: 1,
          price: PRICES[priceId],
          current_period_end: now() + (period?.interval === 'year' ? 365 : 30) * 86400,
        },
      ],
    },
  };
  subscriptions.set(sub.id as string, sub);
  return sub;
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:32rem;margin:3rem auto"><main><h1>${title}</h1>${body}</main></body></html>`;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Handle a request if it's one of ours. Returns false to let the caller carry on. */
export function handleStripe(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? '/', SELF);
  const path = url.pathname;
  const method = req.method ?? 'GET';
  if (!path.startsWith('/v1/') && !path.startsWith('/checkout/') && !path.startsWith('/portal/')) {
    if (path === '/stripe/state' && method === 'GET') {
      json(res, 200, {
        customers: [...customers.values()],
        sessions: [...sessions.values()],
        subscriptions: [...subscriptions.values()],
      });
      return true;
    }
    return false;
  }
  void route(method, path, url, req, res).catch(() => json(res, 500, { error: { message: 'x' } }));
  return true;
}

async function route(
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const form = method === 'POST' ? parseForm(await readBody(req)) : {};
  let m: RegExpMatchArray | null;

  if (method === 'POST' && path === '/v1/customers') {
    const customer = { id: id('cus'), object: 'customer', ...form };
    customers.set(customer.id, customer);
    return json(res, 200, customer);
  }
  if ((m = path.match(/^\/v1\/prices\/([\w]+)$/)) && method === 'GET') {
    return PRICES[m[1]!] ? json(res, 200, PRICES[m[1]!]) : notFound(res);
  }
  if (method === 'POST' && path === '/v1/checkout/sessions') {
    const session: Obj = {
      id: id('cs'),
      object: 'checkout.session',
      status: 'open',
      subscription: null,
      ...form,
    };
    session.url = `${SELF}/checkout/${session.id}`;
    sessions.set(session.id as string, session);
    return json(res, 200, session);
  }
  if ((m = path.match(/^\/v1\/checkout\/sessions\/(\w+)$/)) && method === 'GET') {
    const session = sessions.get(m[1]!);
    if (!session) return notFound(res);
    const expand = url.search.includes('subscription') && session.subscription;
    return json(res, 200, {
      ...session,
      subscription: expand
        ? subscriptions.get(session.subscription as string)
        : session.subscription,
    });
  }
  if ((m = path.match(/^\/v1\/subscriptions\/(\w+)$/))) {
    const sub = subscriptions.get(m[1]!);
    if (!sub) return notFound(res);
    if (method === 'GET') return json(res, 200, sub);
    if (method === 'POST') {
      const items = form.items as Record<string, Obj> | undefined;
      if (items?.['0']?.price) setPrice(sub, String(items['0'].price));
      if (form.cancel_at_period_end !== undefined) {
        sub.cancel_at_period_end = form.cancel_at_period_end === 'true';
      }
      if (form.metadata) sub.metadata = { ...(sub.metadata as Obj), ...(form.metadata as Obj) };
      json(res, 200, sub);
      setImmediate(() => void sendWebhook('customer.subscription.updated', sub));
      return;
    }
    if (method === 'DELETE') {
      sub.status = 'canceled';
      json(res, 200, sub);
      setImmediate(() => void sendWebhook('customer.subscription.deleted', sub));
      return;
    }
  }
  if (method === 'POST' && path === '/v1/billing_portal/sessions') {
    const portal = { id: id('bps'), object: 'billing_portal.session', ...form };
    const qs = new URLSearchParams({
      customer: String(form.customer),
      return: String(form.return_url),
    });
    return json(res, 200, { ...portal, url: `${SELF}/portal/session?${qs}` });
  }

  // The pages a buyer sees.
  if ((m = path.match(/^\/checkout\/(\w+)$/)) && method === 'GET') {
    const session = sessions.get(m[1]!);
    if (!session) return notFound(res);
    const price = PRICES[String((session.line_items as Record<string, Obj>)['0']?.price)];
    const amount = `$${((price?.unit_amount as number) / 100).toFixed(2)}`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
      page(
        'Fixture Checkout',
        `<p>Subscribe for ${amount} per ${(price?.recurring as Obj)?.interval}.</p>
        <form method="post" action="/checkout/${session.id}/pay"><button>Pay ${amount}</button></form>
        <p><a href="${esc(String(session.cancel_url))}">Back</a></p>`,
      ),
    );
    return;
  }
  if ((m = path.match(/^\/checkout\/(\w+)\/pay$/)) && method === 'POST') {
    const session = sessions.get(m[1]!);
    if (!session) return notFound(res);
    const sub = newSubscription(session);
    session.status = 'complete';
    session.subscription = sub.id;
    await sendWebhook('checkout.session.completed', session);
    await sendWebhook('customer.subscription.created', sub);
    const next = String(session.success_url).replace('{CHECKOUT_SESSION_ID}', String(session.id));
    res.writeHead(303, { location: next }).end();
    return;
  }
  if (path === '/portal/session' && method === 'GET') {
    const customer = url.searchParams.get('customer') ?? '';
    const back = url.searchParams.get('return') ?? '/';
    const mine = [...subscriptions.values()].filter(
      (s) => s.customer === customer && s.status !== 'canceled',
    );
    const rows = mine
      .map(
        (
          s,
        ) => `<li>${esc(String((s.items as { data: Obj[] }).data[0]?.price && ((s.items as { data: Obj[] }).data[0]!.price as Obj).id))}
        <form method="post" action="/portal/cancel?sub=${s.id}&return=${encodeURIComponent(back)}"><button>Cancel plan</button></form></li>`,
      )
      .join('');
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        page('Fixture billing portal', `<ul>${rows}</ul><p><a href="${esc(back)}">Return</a></p>`),
      );
    return;
  }
  if (path === '/portal/cancel' && method === 'POST') {
    const sub = subscriptions.get(url.searchParams.get('sub') ?? '');
    if (!sub) return notFound(res);
    sub.status = 'canceled';
    await sendWebhook('customer.subscription.deleted', sub);
    res.writeHead(303, { location: url.searchParams.get('return') ?? '/' }).end();
    return;
  }
  notFound(res);
}
