import Link from '@/components/ui/link';
import { ArrowRight, FileJson, KeyRound, Terminal, Webhook } from 'lucide-react';
import { env } from '@gamecentral/core';
import { SIGNATURE_HEADER, WEBHOOK_EVENTS, type WebhookEvent } from '@gamecentral/shared';
import {
  API_GROUPS,
  API_OBJECTS,
  ENDPOINTS,
  ERROR_CODES,
  type Endpoint,
  type Method,
  type Param,
} from '@/lib/api-docs';
import { curlSample, jsSample, pySample, responseSample } from '@/lib/api-samples';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CodeTabs } from '@/components/developer/code-tabs';
import { CopyButton } from '@/components/ui/copy-button';

export const metadata = {
  title: 'Developers',
  description: `The Game Central API: ${ENDPOINTS.length} endpoints for communities, chat, forums, wikis, events and game servers, plus webhooks.`,
};

// The page is reference material in English, like most API docs; its examples are the same in
// every language.

const METHOD_STYLE: Record<Method, string> = {
  GET: 'border-success bg-success/10',
  POST: 'border-primary bg-primary/10',
  PATCH: 'border-warning bg-warning/12',
  PUT: 'border-accent bg-accent/12',
  DELETE: 'border-danger bg-danger/10',
};

function MethodBadge({ method, small }: { method: Method; small?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 justify-center rounded-ui-sm border-s-4 font-mono font-bold text-fg',
        small ? 'w-14 px-1 text-[0.6875rem]' : 'w-16 px-1.5 py-0.5 text-xs',
        METHOD_STYLE[method],
      )}
    >
      {method}
    </span>
  );
}

function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="overflow-x-auto rounded-ui border border-border bg-surface-2 p-4 font-mono text-[0.8125rem] leading-relaxed"
    >
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id={`${id}-h`} className="text-2xl font-bold">
          {title}
        </h2>
        {lead && <p className="max-w-3xl text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/** A table that scrolls sideways on narrow screens instead of squashing. */
function Table({
  label,
  head,
  rows,
}: {
  label: string;
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={label}
      className="overflow-x-auto rounded-ui border border-border"
    >
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-2">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-border align-top">
              {cells.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inline = 'rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.8125em]';

function ParamsTable({ endpoint }: { endpoint: Endpoint }) {
  const params = endpoint.params ?? [];
  if (!params.length) return null;
  const where: Record<Param['in'], string> = { path: 'path', query: 'query', body: 'body' };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Parameters</p>
      <ul className="divide-y divide-border rounded-ui border border-border">
        {params.map((p) => (
          <li
            key={`${p.in}-${p.name}`}
            className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:gap-6"
          >
            <div className="flex flex-col gap-0.5 sm:w-64 sm:shrink-0">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <code className="font-mono text-sm font-semibold">{p.name}</code>
                <span className="text-xs text-muted">{where[p.in]}</span>
                {(p.required || p.in === 'path') && (
                  <span className="text-xs font-semibold text-danger">required</span>
                )}
              </span>
              <code className="font-mono text-xs break-words text-muted">{p.type}</code>
            </div>
            <p className="text-sm">{p.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EndpointCard({ endpoint: e, base }: { endpoint: Endpoint; base: string }) {
  const response = responseSample(e);
  return (
    <article
      id={e.id}
      aria-labelledby={`${e.id}-h`}
      className="flex scroll-mt-24 flex-col gap-4 rounded-ui-lg border border-border bg-surface p-4 sm:p-6"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id={`${e.id}-h`} className="text-lg font-bold">
            {e.title}
          </h3>
          {e.write && (
            <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold">
              Read-and-write token
            </span>
          )}
        </div>
        <p className="flex items-start gap-2 font-mono text-sm">
          <MethodBadge method={e.method} />
          <span className="break-all">{e.path}</span>
        </p>
        <p>{e.description}</p>
      </header>
      <ParamsTable endpoint={e} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-semibold">Request</p>
          <CodeTabs
            label={`Example request for ${e.title}`}
            samples={[
              { lang: 'curl', label: 'curl', code: curlSample(base, e) },
              { lang: 'js', label: 'JavaScript', code: jsSample(base, e) },
              { lang: 'python', label: 'Python', code: pySample(base, e) },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-semibold">
            Response <span className="font-mono font-normal text-muted">{response.status}</span>
          </p>
          <div className="overflow-hidden rounded-ui border border-border bg-surface-2">
            <div className="flex justify-end border-b border-border px-2 py-1.5">
              <CopyButton text={response.body} label="Copy JSON" />
            </div>
            <pre
              tabIndex={0}
              aria-label={`Example response for ${e.title}`}
              className="max-h-96 overflow-auto p-4 font-mono text-[0.8125rem] leading-relaxed"
            >
              <code>{response.body}</code>
            </pre>
          </div>
        </div>
      </div>
    </article>
  );
}

/** What each webhook event means and what its `data` holds (typed: a new event needs a line). */
const EVENT_DOCS: Record<WebhookEvent, [when: string, data: string]> = {
  'member.joined': ['Someone joins.', 'user'],
  'member.left': ['Someone leaves, or is kicked or banned.', 'user, reason (left, kicked, banned)'],
  'message.created': [
    'A chat message is posted.',
    'channel, message (id, content, url, createdAt), author',
  ],
  'thread.created': [
    'A forum thread is started.',
    'channel, thread (id, title, excerpt, url), author',
  ],
  'post.created': [
    'Someone replies in a forum thread.',
    'channel, thread (id, title, url), post (id, excerpt, url), author',
  ],
  'announcement.created': [
    'A thread is posted in an announcement channel.',
    'channel, thread (id, title, excerpt, url), author',
  ],
  'event.created': [
    'An event is added to the calendar.',
    'event (id, title, description, location, startsAt, endsAt, timezone, allDay, recurring)',
  ],
  'application.submitted': ['Someone applies to join.', 'user, application (id), reviewUrl'],
  'server.down': ['One of the community’s game servers stops answering.', 'server (id, name, url)'],
  'server.up': ['It answers again.', 'server (id, name, url), downtimeMs'],
};

const GUIDE: [id: string, title: string][] = [
  ['quick-start', 'Quick start'],
  ['auth', 'Tokens and access'],
  ['rate-limits', 'Rate limits'],
  ['errors', 'Responses and errors'],
  ['paging', 'Paging'],
  ['objects', 'Objects'],
];
const AFTER: [id: string, title: string][] = [
  ['webhooks', 'Webhooks'],
  ['signatures', 'Checking signatures'],
  ['versioning', 'Versioning'],
];

const navLink =
  'flex items-center gap-2 rounded-ui-sm px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg';

function DocsNav() {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Guide</p>
        <ul>
          {GUIDE.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className={navLink}>
                {title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
          Reference
        </p>
        <ul className="flex flex-col gap-2">
          {API_GROUPS.map((g) => (
            <li key={g.id}>
              <a href={`#${g.id}`} className={cn(navLink, 'font-semibold text-fg')}>
                {g.title}
              </a>
              <ul>
                {g.endpoints.map((e) => (
                  <li key={e.id}>
                    <a href={`#${e.id}`} className={cn(navLink, 'items-start')}>
                      <span className="pt-0.5">
                        <MethodBadge method={e.method} small />
                      </span>
                      <span className="min-w-0">{e.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
          Webhooks
        </p>
        <ul>
          {AFTER.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className={navLink}>
                {title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const WRITES = ENDPOINTS.filter((e) => e.write);

export default function DevelopersPage() {
  const site = env().APP_URL.replace(/\/$/, '');
  const base = `${site}/api/v1`;
  const me = ENDPOINTS.find((e) => e.id === 'get-me')!;
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10">
      <nav
        aria-label="Developer docs"
        className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pe-2"
      >
        <DocsNav />
      </nav>

      <article className="flex min-w-0 flex-col gap-12 leading-relaxed [&_p_a]:text-primary [&_p_a]:underline [&_td_a]:text-primary [&_td_a]:underline">
        <header className="flex flex-col gap-5 rounded-ui-lg border border-border bg-surface p-6 sm:p-8">
          <p className="w-fit rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
            API v1
          </p>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold sm:text-4xl">Developers</h1>
            <p className="max-w-2xl text-lg text-muted">
              Build bots, dashboards and integrations on Game Central. Read and act on communities,
              chat, forums, wikis, events and game servers with the API, and hear about what happens
              as it happens with webhooks.
            </p>
          </div>
          <div className="flex w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-1 rounded-ui border border-border bg-surface-2 py-1 ps-3 pe-1">
            <span className="text-xs font-semibold text-muted">Base URL</span>
            <code className="min-w-0 flex-1 font-mono text-sm break-all">{base}</code>
            <CopyButton text={base} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/settings/developer">
                <KeyRound aria-hidden />
                Create a token
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/v1/openapi.json" download="gamecentral-openapi.json">
                <FileJson aria-hidden />
                OpenAPI spec
              </a>
            </Button>
            <Button asChild variant="ghost">
              <a href="#webhooks">
                <Webhook aria-hidden />
                Webhooks
              </a>
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-5 text-sm sm:grid-cols-4">
            {[
              ['Endpoints', String(ENDPOINTS.length)],
              ['Format', 'JSON'],
              ['Auth', 'Bearer token'],
              ['Rate limit', '120 a minute'],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-muted">{term}</dt>
                <dd className="text-base font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <details className="rounded-ui-lg border border-border bg-surface p-4 lg:hidden">
          <summary className="cursor-pointer font-semibold">On this page</summary>
          <nav aria-label="On this page" className="mt-3">
            <DocsNav />
          </nav>
        </details>

        <Section
          id="quick-start"
          title="Quick start"
          lead="From nothing to your first call in a couple of minutes."
        >
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: KeyRound,
                title: 'Make a token',
                body: (
                  <>
                    In <Link href="/settings/developer">Settings → Developer</Link>. Choose
                    read-only, or let it post and make changes too.
                  </>
                ),
              },
              {
                icon: Terminal,
                title: 'Call the API',
                body: (
                  <>
                    Send it as <code className={inline}>Authorization: Bearer mx_…</code> with every
                    request. Start with <a href="#get-me">/me</a>.
                  </>
                ),
              },
              {
                icon: Webhook,
                title: 'Hear about changes',
                body: (
                  <>
                    Community managers add <a href="#webhooks">webhooks</a> under Settings →
                    Integrations, for Discord or your own server.
                  </>
                ),
              },
            ].map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-4"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <span
                    aria-hidden
                    className="grid size-7 place-items-center rounded-full bg-primary/12 text-sm text-primary"
                  >
                    {i + 1}
                  </span>
                  {step.title}
                </span>
                <p className="text-sm text-muted [&_a]:text-primary [&_a]:underline">{step.body}</p>
              </li>
            ))}
          </ol>
          <CodeTabs
            label="Your first request"
            samples={[
              { lang: 'curl', label: 'curl', code: curlSample(base, me) },
              { lang: 'js', label: 'JavaScript', code: jsSample(base, me) },
              { lang: 'python', label: 'Python', code: pySample(base, me) },
            ]}
          />
        </Section>

        <Section
          id="auth"
          title="Tokens and access"
          lead="The API acts as you: it sees the communities and channels you can see and can do what you could do on the site, never more."
        >
          <p>
            Each token is either <strong>read-only</strong> or <strong>read and write</strong>. Keep
            tokens secret: anyone holding one can act as you. Delete a token in{' '}
            <Link href="/settings/developer">Settings → Developer</Link> and it stops working at
            once. Give each script its own, so you can delete one without breaking the rest.
          </p>
          <Table
            label="What each kind of token can do"
            head={['Token', 'Can']}
            rows={[
              ['Read-only', 'Every GET endpoint.'],
              [
                'Read and write',
                <ul key="w" className="flex flex-col gap-1">
                  <li>Everything a read-only token can, and:</li>
                  {WRITES.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <MethodBadge method={e.method} small />
                      <a href={`#${e.id}`}>{e.title}</a>
                    </li>
                  ))}
                </ul>,
              ],
            ]}
          />
          <p>
            Writes follow the same rules as the site: channel permissions, slow mode, locked
            threads, and the community’s automod, which may hold a post for a moderator to review.
          </p>
        </Section>

        <Section id="rate-limits" title="Rate limits">
          <ul className="flex list-disc flex-col gap-1.5 ps-5">
            <li>
              <strong>120 requests a minute</strong> for each token, and 300 a minute for each
              person across all their tokens.
            </li>
            <li>
              Writes also count towards the site’s own limits, such as 10 chat messages every 10
              seconds and 10 new threads every 10 minutes.
            </li>
            <li>
              Over a limit, you get <code className={inline}>429</code> with a{' '}
              <code className={inline}>Retry-After</code> header: the seconds to wait before trying
              again.
            </li>
          </ul>
        </Section>

        <Section
          id="errors"
          title="Responses and errors"
          lead="Everything is JSON, never cached. Success puts the result under data; a problem puts a code and a readable message under error, with a matching status."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Code label="A successful response">{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": { "id": "…", "name": "Alice" }
}`}</Code>
            <Code label="An error response">{`HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "code": "forbidden",
    "message": "This token can only read."
  }
}`}</Code>
          </div>
          <Table
            label="Error codes"
            head={['Status', 'Code', 'Meaning']}
            rows={ERROR_CODES.map((c) => [
              <code key="s" className="font-mono">
                {c.status}
              </code>,
              <code key="c" className="font-mono">
                {c.code}
              </code>,
              c.meaning,
            ])}
          />
          <p>
            Something you can’t see answers <code className={inline}>404</code>, not{' '}
            <code className={inline}>403</code>, so a token can’t be used to find out what exists in
            a private community.
          </p>
        </Section>

        <Section id="paging" title="Paging" lead="Lists come a page at a time, in one of two ways.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-4">
              <h3 className="font-semibold">By page number</h3>
              <p className="text-sm">
                Communities, members, threads, posts and servers take{' '}
                <code className={inline}>?page=</code> (from 0) and often{' '}
                <code className={inline}>?limit=</code>. The response says{' '}
                <code className={inline}>page</code>, <code className={inline}>pageSize</code> and
                either <code className={inline}>total</code> or{' '}
                <code className={inline}>hasMore</code>.
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-4">
              <h3 className="font-semibold">Before and after (chat)</h3>
              <p className="text-sm">
                Messages arrive too fast for page numbers. Ask for{' '}
                <code className={inline}>?before=</code> the oldest message you have to go back, or{' '}
                <code className={inline}>?after=</code> the newest to catch up;{' '}
                <code className={inline}>hasMoreBefore</code> and{' '}
                <code className={inline}>hasMoreAfter</code> say when to stop.
              </p>
            </div>
          </div>
          <p>
            Ids are UUIDs, and times are ISO 8601 in UTC, like{' '}
            <code className={inline}>2026-10-04T18:30:00.000Z</code>.
          </p>
        </Section>

        <Section
          id="objects"
          title="Objects"
          lead="The main things the API returns. Fields not listed here are described with the endpoints that return them."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {API_OBJECTS.map((o) => (
              <div
                key={o.id}
                id={`object-${o.id}`}
                className="flex scroll-mt-24 flex-col gap-3 rounded-ui-lg border border-border bg-surface p-4"
              >
                <div>
                  <h3 className="text-lg font-bold">{o.title}</h3>
                  <p className="text-sm text-muted">{o.description}</p>
                </div>
                <Table
                  label={`${o.title} fields`}
                  head={['Field', 'Type', 'Notes']}
                  rows={o.fields.map(([name, type, notes]) => [
                    <code key="n" className="font-mono font-semibold">
                      {name}
                    </code>,
                    <code key="t" className="font-mono text-xs">
                      {type}
                    </code>,
                    notes,
                  ])}
                />
              </div>
            ))}
          </div>
        </Section>

        {API_GROUPS.map((g) => (
          <Section key={g.id} id={g.id} title={g.title} lead={g.description}>
            <ul className="flex flex-col divide-y divide-border rounded-ui-lg border border-border bg-surface">
              {g.endpoints.map((e) => (
                <li key={e.id}>
                  <a
                    href={`#${e.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-2"
                  >
                    <MethodBadge method={e.method} />
                    <code className="font-mono text-sm break-all">{e.path}</code>
                    <span className="ms-auto text-sm text-muted">{e.title}</span>
                  </a>
                </li>
              ))}
            </ul>
            {g.endpoints.map((e) => (
              <EndpointCard key={e.id} endpoint={e} base={base} />
            ))}
          </Section>
        ))}

        <Section
          id="webhooks"
          title="Webhooks"
          lead="Hear about what happens in a community as it happens, without asking over and over."
        >
          <p>
            Community managers add webhooks in their community’s settings under{' '}
            <strong>Integrations</strong>. A Discord webhook URL gets readable messages in that
            Discord channel (nobody is pinged); any other <code className={inline}>https://</code>{' '}
            address gets a signed JSON <code className={inline}>POST</code> for each event it chose.
            Only content from channels everyone in the community can see is sent.
          </p>
          <Table
            label="Webhook events"
            head={['Event', 'When', 'data holds']}
            rows={WEBHOOK_EVENTS.map((e) => [
              <code key="e" className="font-mono font-semibold whitespace-nowrap">
                {e}
              </code>,
              EVENT_DOCS[e][0],
              <span key="d" className="text-muted">
                {EVENT_DOCS[e][1]}
              </span>,
            ])}
          />
          <p>
            Each delivery looks like this (a <code className={inline}>ping</code> event, with empty
            data, is sent by the <strong>Send test</strong> button):
          </p>
          <Code label="A webhook delivery">{`POST /your/endpoint HTTP/1.1
Content-Type: application/json
X-GameCentral-Event: thread.created
X-GameCentral-Delivery: 0192f1c4-…
X-GameCentral-Timestamp: 1791140400
X-GameCentral-Signature: sha256=5d41402abc4b2a76…

{
  "id": "0192f1c4-…",
  "event": "thread.created",
  "occurredAt": "2026-10-04T18:20:00.000Z",
  "community": { "id": "…", "slug": "my-clan", "name": "My Clan", "url": "${site}/c/my-clan" },
  "data": {
    "channel": { "id": "…", "name": "general" },
    "thread": { "id": "…", "title": "Season 4 plans", "excerpt": "…", "url": "…" },
    "author": { "id": "…", "name": "Alice", "username": "alice", "url": "…" }
  }
}`}</Code>
          <ul className="flex list-disc flex-col gap-1.5 ps-5">
            <li>Answer with any 2xx status within 8 seconds.</li>
            <li>
              Network errors, timeouts, 408, 429 and 5xx are tried again up to 5 times, waiting
              longer each time. Redirects aren’t followed.
            </li>
            <li>
              Use <code className={inline}>X-GameCentral-Delivery</code> to ignore a delivery you’ve
              already handled: retries keep the same id.
            </li>
            <li>
              After 20 failed deliveries in a row the webhook switches itself off; switch it back on
              in settings.
            </li>
          </ul>
        </Section>

        <Section
          id="signatures"
          title="Checking signatures"
          lead="Make sure a delivery really comes from Game Central before trusting it."
        >
          <p>
            Adding a JSON webhook shows its signing secret once. Each delivery’s{' '}
            <code className={inline}>{SIGNATURE_HEADER}</code> header is{' '}
            <code className={inline}>sha256=</code> followed by the hex HMAC-SHA256, with that
            secret, of the timestamp header, a dot, and the raw request body. Check it against the
            raw body (before parsing the JSON), and turn away old timestamps so a captured delivery
            can’t be replayed.
          </p>
          <CodeTabs
            label="Checking a signature"
            samples={[
              {
                lang: 'js',
                label: 'Node.js',
                code: `import { createHmac, timingSafeEqual } from 'node:crypto';

function isFromGameCentral(secret, headers, rawBody) {
  const timestamp = headers['x-gamecentral-timestamp'];
  const expected =
    'sha256=' + createHmac('sha256', secret).update(\`\${timestamp}.\${rawBody}\`).digest('hex');
  const given = headers['${SIGNATURE_HEADER}'] ?? '';
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return fresh && given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}`,
              },
              {
                lang: 'python',
                label: 'Python',
                code: `import hashlib
import hmac
import time

def is_from_game_central(secret: str, headers, raw_body: bytes) -> bool:
    timestamp = headers["X-GameCentral-Timestamp"]
    signed = timestamp.encode() + b"." + raw_body
    expected = "sha256=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    fresh = abs(time.time() - int(timestamp)) < 300
    return fresh and hmac.compare_digest(headers.get("X-GameCentral-Signature", ""), expected)`,
              },
            ]}
          />
        </Section>

        <Section id="versioning" title="Versioning">
          <p>
            Version 1 is stable. New endpoints and new fields are added over time, so ignore fields
            you don’t recognise; existing ones aren’t renamed or removed. A change that would break
            things would come as <code className={inline}>/api/v2</code>, with notice. Changes are
            listed in <Link href="/changelog">What’s new</Link>.
          </p>
          <p className="flex flex-wrap items-center gap-2">
            Missing something you need?
            <Link
              href="/feedback"
              className="inline-flex items-center gap-1 font-semibold text-primary underline"
            >
              Suggest an endpoint <ArrowRight aria-hidden className="size-4" />
            </Link>
          </p>
        </Section>
      </article>
    </div>
  );
}
