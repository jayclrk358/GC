import Link from 'next/link';
import { env } from '@gamecentral/core';
import { SIGNATURE_HEADER, WEBHOOK_EVENTS } from '@gamecentral/shared';

export const metadata = {
  title: 'Developers',
  description: 'The Game Central API and webhooks: build bots, dashboards and integrations.',
};

function Code({ children }: { children: string }) {
  return (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-ui border border-border bg-surface-2 p-4 font-mono text-sm leading-relaxed"
    >
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const ENDPOINTS: [method: string, path: string, what: string][] = [
  ['GET', '/me', 'You, and the communities you’re in.'],
  ['GET', '/communities/{slug}', 'A community: name, members, how to join, and your place in it.'],
  ['GET', '/communities/{slug}/channels', 'The channels you can see.'],
  [
    'GET',
    '/communities/{slug}/threads',
    'Forum threads. ?channel={id} for one forum (with ?sort= and ?page=), otherwise the latest across all of them.',
  ],
  [
    'GET',
    '/communities/{slug}/events',
    'Upcoming events, each date of a repeating event separately.',
  ],
  ['GET', '/communities/{slug}/servers', 'The community’s game servers and their live status.'],
  [
    'GET',
    '/channels/{id}/messages',
    'A chat channel’s messages, oldest first. ?before={id} or ?after={id} to page, ?limit= up to 100.',
  ],
  [
    'POST',
    '/channels/{id}/messages',
    'Post a message as you: {"content": "…"}. Needs a token that can post.',
  ],
  ['GET', '/servers/{id}', 'A listed game server and its live status.'],
];

export default function DevelopersPage() {
  const base = `${env().APP_URL.replace(/\/$/, '')}/api/v1`;
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 leading-relaxed [&_a]:text-primary [&_a]:underline">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Developers</h1>
        <p className="text-muted">
          Build bots, dashboards and integrations on top of Game Central: read communities, chat,
          forums, events and game servers with the API, and hear about what happens with webhooks.
        </p>
      </header>

      <Section id="auth" title="Getting a token">
        <p>
          Make a personal token in <Link href="/settings/developer">Settings → Developer</Link>. The
          API acts as you, with exactly your access: it sees the communities and channels you can
          see. Tokens can only read unless you let them post. Send it with every request:
        </p>
        <Code>{`curl ${base}/me \\
  -H "Authorization: Bearer mx_your_token"`}</Code>
        <p>
          Each token can make 120 requests a minute. Over that you get <code>429</code> with a{' '}
          <code>Retry-After</code> header. Keep tokens secret: anyone with one can act as you.
          Delete a token in settings and it stops working at once.
        </p>
      </Section>

      <Section id="responses" title="Responses">
        <p>
          Everything is JSON. Success is <code>{'{ "data": … }'}</code>; a problem is{' '}
          <code>{'{ "error": { "code": "…", "message": "…" } }'}</code> with a matching status: 401
          (no or bad token), 403 (not allowed), 404 (not found, or not visible to you), 422 (invalid
          input) or 429 (too many requests). A message held for moderator review by the community’s
          automod answers <code>202</code> with the code <code>held</code>.
        </p>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <p>
          All paths start with <code>{base}</code>.
        </p>
        <div tabIndex={0} role="region" aria-label="API endpoints" className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-start">
                <th scope="col" className="py-2 pe-3 text-start">
                  Method
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  Path
                </th>
                <th scope="col" className="py-2 text-start">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([method, path, what]) => (
                <tr key={`${method} ${path}`} className="border-b border-border align-top">
                  <td className="py-2 pe-3 font-mono font-semibold">{method}</td>
                  <td className="py-2 pe-3 font-mono break-all">{path}</td>
                  <td className="py-2">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Posting a message:</p>
        <Code>{`curl -X POST ${base}/channels/CHANNEL_ID/messages \\
  -H "Authorization: Bearer mx_your_token" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Server restarting in 5 minutes"}'`}</Code>
      </Section>

      <Section id="webhooks" title="Webhooks">
        <p>
          Community managers add webhooks in their community’s settings under{' '}
          <strong>Integrations</strong>. A Discord webhook URL gets readable messages in that
          Discord channel; any other <code>https://</code> address gets a JSON <code>POST</code> for
          each event it chose. Only content from channels everyone in the community can see is sent.
          Nobody is pinged by Discord messages.
        </p>
        <p>The events:</p>
        <ul className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((e) => (
            <li key={e}>
              <code className="rounded-ui bg-surface-2 px-2 py-0.5 text-sm">{e}</code>
            </li>
          ))}
        </ul>
        <p>A delivery looks like this:</p>
        <Code>{`POST /your/endpoint
Content-Type: application/json
X-GameCentral-Event: thread.created
X-GameCentral-Delivery: 0192f1c4-…
X-GameCentral-Timestamp: 1767225600
X-GameCentral-Signature: sha256=5d41402abc4b2a76…

{
  "id": "0192f1c4-…",
  "event": "thread.created",
  "occurredAt": "2026-01-01T00:00:00.000Z",
  "community": { "id": "…", "slug": "my-clan", "name": "My Clan", "url": "…" },
  "data": {
    "channel": { "id": "…", "name": "general" },
    "thread": { "id": "…", "title": "Season 4 plans", "excerpt": "…", "url": "…" },
    "author": { "id": "…", "name": "Alice", "username": "alice", "url": "…" }
  }
}`}</Code>
        <p>
          Answer with any 2xx status within 8 seconds. Network errors, timeouts, 408, 429 and 5xx
          are tried again up to 5 times, waiting longer each time; redirects aren’t followed. After
          20 failed deliveries in a row the webhook switches itself off (switch it back on in
          settings). The <strong>Send test</strong> button sends a <code>ping</code> event.
        </p>
      </Section>

      <Section id="signatures" title="Checking signatures">
        <p>
          When you add a JSON webhook you get a signing secret (shown once). Each delivery’s{' '}
          <code>{SIGNATURE_HEADER}</code> header is <code>sha256=</code> and the hex HMAC-SHA256,
          with that secret, of the timestamp header, a dot, and the raw body. Check it, and reject
          old timestamps, before trusting a delivery:
        </p>
        <Code>{`import { createHmac, timingSafeEqual } from 'node:crypto';

function isFromGameCentral(secret, headers, rawBody) {
  const timestamp = headers['x-gamecentral-timestamp'];
  const expected =
    'sha256=' + createHmac('sha256', secret).update(\`\${timestamp}.\${rawBody}\`).digest('hex');
  const given = headers['${SIGNATURE_HEADER}'] ?? '';
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return fresh && given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}`}</Code>
      </Section>
    </article>
  );
}
