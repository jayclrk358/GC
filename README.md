# Game Central

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/game-central-logo-dark.svg">
  <img alt="Game Central" src="docs/brand/game-central-logo.svg" width="420">
</picture>

Community hubs for games and game servers. Anyone can create a community with a fully
customisable landing page, forum, wiki, events, real-time chat and live game server status.
Game Central is built around two ideas: **deep customisation** and **first-class accessibility**.

> Status: under active development. See [Roadmap](#roadmap) for what is done.

The logo files (the icon, and the full logo for light and dark backgrounds, as SVG and PNG) are in
[`docs/brand`](docs/brand).

## Highlights

- **Customisable hubs:** themes (with a built-in WCAG contrast checker), fonts, banners and a
  drag-and-drop page builder with keyboard support.
- **Game servers:** link Minecraft, Rust, CS2, FiveM, ARK, Valheim and more. Status and player
  counts update live, with 24-hour, 7-day and 30-day player and uptime charts. A global server
  browser with filters, daily voting (with Minecraft Votifier rewards), and "server down" / "back
  up" alerts posted in chat.
- **Forum, wiki, events and chat:** persistent, searchable discussions plus real-time channels.
- **Roles and permissions:** Discord-style permission bits with category and channel overrides.
- **Moderation built in:** automod with a mod queue, applications to join, welcome steps with
  rules, reports, timeouts, bans and an audit log.
- **Light, dark or system colour scheme** from a toggle in the header, saved per browser and to
  your account. Every community theme defines both a light and a dark palette.
- **Accessibility settings that always win:** high contrast, dyslexia-friendly fonts, text size
  and spacing, reduced motion, no autoplay, still images, underlined links, bold focus rings,
  screen-reader-friendly chat, and remappable keyboard shortcuts (single-key shortcuts can be
  turned off, per WCAG 2.1.4). They override every community theme.

## Architecture

```
apps/web          Next.js 16 (App Router): UI, route handlers, server actions
apps/realtime     Socket.IO server: authenticated room subscriptions, presence, typing
apps/worker       BullMQ workers: game server polling, rollups, notifications, maintenance
apps/desktop      Game Central for Windows: the website in its own window (Electron, built with npm)
packages/shared   Isomorphic domain logic: permissions, theme tokens + contrast, prefs, rich text
packages/db       Drizzle ORM schema, migrations and seed data (Postgres 16)
packages/core     Server-side services: access control, rate limits, storage, email, queues
packages/auth     Better Auth instance shared by web and realtime
```

Key decisions:

- **All writes go over HTTP**, through `packages/core` services, then Postgres, then a Redis
  emitter that pushes updates to sockets. The socket connection only carries subscriptions and
  ephemeral signals (typing, presence). Every write has one validation and permission path.
- **Socket auth** reuses the Better Auth session cookie. Every room join is authorised against the
  database.
- **Theming cascade** uses CSS layers: site tokens, then the community theme, then Tailwind, then
  user preferences. Theme values are validated hex colours or enums, so community CSS can't be
  used for injection.
- **Game server polling** is SSRF-guarded: private, loopback, link-local and CGNAT addresses are
  rejected after DNS resolution, and each address is polled once however many listings share it.

## Getting started

Requirements: Node 22, pnpm 10, Postgres 16, Redis 7.

```bash
cp .env.example .env            # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm install

# Backing services (or use your own Postgres/Redis):
docker compose up -d postgres redis-queue redis-cache mailpit

pnpm db:migrate
pnpm db:seed                    # game catalog + demo data
pnpm dev                        # web :3000, realtime :3001, worker (health :3002)
```

Open http://localhost:3000. With `SMTP_URL` empty, emails (verification, password reset) are
printed to the console.

### On Windows

Install [Node.js 22](https://nodejs.org), [Git](https://git-scm.com) and
[Docker Desktop](https://www.docker.com/products/docker-desktop/), and start Docker Desktop. Then,
in the project folder:

1. Double-click **`windows-setup.cmd`** (once). It checks the tools, installs pnpm if needed,
   creates `.env` with a random secret, installs packages, starts Postgres and Redis in Docker,
   and loads the demo data.
2. Double-click **`windows-start.cmd`** whenever you want to run Game Central. It opens
   http://localhost:3000 when it's ready; press Ctrl+C in its window to stop.

The scripts live in `scripts/windows/`. To do the same by hand in PowerShell: copy
`.env.example` to `.env`, set `BETTER_AUTH_SECRET`, then run `pnpm install`,
`docker compose up -d --wait postgres redis-queue redis-cache mailpit`, `pnpm db:migrate`,
`pnpm db:seed` and `pnpm dev`. If port 5432 is taken, a native Postgres install is running:
stop it, or change the port in `docker-compose.yml` and `DATABASE_URL`.

### Hosting on Linux (Docker)

Everything runs in containers: Postgres, Redis, the three apps, Mailpit, and Caddy in front. Caddy
handles HTTPS and serves uploads from a separate, cookie-less address. You need
[Docker Engine with the Compose plugin](https://docs.docker.com/engine/install/), `git` and
`openssl`.

```bash
git clone -b claude/nice-davinci-h3tk5l https://github.com/jayclrk358/Magnox.git gamecentral
cd gamecentral
scripts/linux/server-env.sh                     # just this machine: https://localhost
scripts/linux/server-env.sh 192.168.1.50        # or: other devices on your network (your IP)
scripts/linux/server-env.sh gamecentral.example.com  # or: a domain on the internet
docker compose up -d --build                    # first build takes a few minutes
```

Then open the address the script printed. The script writes `.env` with random secrets (run it
once, before the first start) and makes `docker compose` include `docker-compose.prod.yml`, which
keeps the databases off the network and restarts everything after a reboot.

- **By IP address:** Caddy signs its own certificate, so each browser warns once; continue past
  the warning, or install Caddy's root certificate on your devices
  (`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .`). Uploads use port 8443.
- **With a domain:** point DNS records for `gamecentral.example.com` and `media.gamecentral.example.com` at
  the server and open ports 80 and 443. Caddy gets Let's Encrypt certificates automatically.
- **Email:** with `SMTP_URL` empty, mail (sign-up confirmations, password resets) lands in
  Mailpit at http://localhost:8025 on the server. For real email, set `SMTP_URL` in `.env`, e.g.
  `smtps://no-reply%40example.com:password@smtp.example.com:465` (write the `@` in the user name
  as `%40`), and make `EMAIL_FROM` the same mailbox. Then `docker compose up -d`.
- **Bot protection:** create a Cloudflare Turnstile widget for your domain and put its keys in
  `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `.env`, then `docker compose up -d`. Sign-up,
  sign-in, password resets and server votes then ask for the check.
- **Update:** `git pull && docker compose up -d --build` (migrations run automatically).
- **Set up before the rename to Game Central?** Run `scripts/linux/move-to-gamecentral.sh` once
  after `git pull` instead: it moves the database, uploads and certificates to the new names
  (keeping the old copies until you remove them) and starts the site again.
- **Logs / stop:** `docker compose logs -f web worker`, `docker compose down` (data stays in
  Docker volumes).
- **Backup:** `docker compose exec postgres pg_dump -U gamecentral gamecentral > gamecentral.sql`, plus the
  `gamecentral_media` volume (uploads).
- **Hosted Postgres or Redis (optional):** set `EXTERNAL_DATABASE_URL` (and, for Redis,
  `EXTERNAL_REDIS_QUEUE_URL` / `EXTERNAL_REDIS_CACHE_URL`) in `.env`, then add
  `-f docker-compose.external.yml` to your `docker compose` command; the bundled containers are
  then left off (add `--profile local-redis` to keep Redis on the server). Pick the same region as
  the server: pages run a few dozen queries, so a distant database makes every page slower.
  Redis is used for every live event, so it's usually best left on the server. The queue Redis
  needs `maxmemory-policy noeviction`; pay-per-command Redis plans get expensive with job queues.

### Payments (Stripe)

Communities can buy the **Plus** or **Pro** plan from `/store` (or Plan & billing in their
settings). Plans raise limits (linked servers, roles, channels, files per chat message, upload
sizes) and unlock perks:

|                                                                 | Free | Plus                    | Pro                      |
| --------------------------------------------------------------- | ---- | ----------------------- | ------------------------ |
| Name and role effects (gradients, glow, animations), role icons |      | ✓                       | ✓                        |
| Page background picture, chat channel backgrounds               |      | ✓                       | ✓                        |
| Custom separators in the channel list                           |      | ✓                       | ✓                        |
| Voice channels                                                  |      | 3, up to 15 people each | 10, up to 50 people each |
| Screen sharing in voice                                         |      |                         | ✓                        |
| Plan badge / Featured on Explore                                |      | badge                   | badge and Featured       |

Free keeps the limits every community had before plans existed. A community that drops back to
Free keeps its settings for the perks above; they stop showing until it upgrades again. Plans,
limits and perks live in `packages/shared/src/plans.ts`.

To take payments:

1. In the [Stripe dashboard](https://dashboard.stripe.com), create a **Plus** and a **Pro**
   product, each with a monthly and a yearly recurring price.
2. Add a webhook endpoint `https://YOUR-DOMAIN/api/stripe/webhook` sending
   `checkout.session.completed` and `customer.subscription.created`, `.updated` and `.deleted`.
3. Put the secret key, the webhook's signing secret and the four price ids in `.env`
   (`STRIPE_*`, see `.env.example`), then `docker compose up -d`.
4. Optional: turn on the [customer portal](https://dashboard.stripe.com/settings/billing/portal)
   so payers can update cards and download invoices.

Without a key the store still shows the plans, with buying turned off. Tests use a fake Stripe in
`apps/worker/src/fixtures/fake-stripe.ts`.

### Voice channels (LiveKit)

Voice channels run on your own [LiveKit](https://livekit.io) server, the `livekit` service in
`docker-compose.yml`. Browsers connect to it through Caddy (`/rtc` on your site's address), and
the audio itself goes straight to ports 7881/tcp and 7882/udp.

`scripts/linux/server-env.sh` sets this up for new servers. For an existing `.env`:

```bash
cat >> .env <<ENV
COMPOSE_PROFILES=voice
LIVEKIT_API_KEY=$(openssl rand -hex 8)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
ENV
sudo ufw allow 7881/tcp && sudo ufw allow 7882/udp   # and in your host's firewall panel
docker compose up -d --build
```

- **Home network or IP address only:** also set `LIVEKIT_NODE_IP` to the server's IP and
  `LIVEKIT_USE_EXTERNAL_IP=false`. On a server with a public IP, LiveKit finds its address itself.
- **Behind strict firewalls** (some schools and offices allow only port 443), audio can't get
  through without a TURN server; see LiveKit's [TURN docs](https://docs.livekit.io/home/self-hosting/deployment/#improving-connectivity-with-turn).
- **Local development:** run [livekit-server](https://docs.livekit.io/home/self-hosting/local/)
  with the same settings as the `LIVEKIT_CONFIG` in `docker-compose.yml` (webhook to
  `http://localhost:3000/api/voice/webhook`), and set `LIVEKIT_URL=ws://localhost:7880`.
- **More capacity:** one LiveKit server handles hundreds of people talking. For more, run LiveKit
  on more servers, all pointed at the same Redis (add a `redis:` block to `LIVEKIT_CONFIG`) and
  each with its own public IP and open ports. List them all after `reverse_proxy @voice` in
  `docker/Caddyfile`, and LiveKit places each call on a server with room. Set `LIVEKIT_API_URL`
  if LiveKit no longer runs next to the app.

Without the keys, voice channels say that voice isn't set up yet.

## Admin console

Game Central staff look after the whole site at **/admin** (it's in the account menu for staff; for
everyone else the page doesn't exist). There are three staff roles:

| Role      | Who                                         | Can                                                                       |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Owner     | Confirmed emails in `PLATFORM_ADMIN_EMAILS` | Everything, including adding and removing admins                          |
| Admin     | Given by the owner (or `admin:grant`)       | Everything else, including adding and removing moderators                 |
| Moderator | Given by the owner or an admin              | People, posts and messages, reports, feedback, and looking up communities |

Nobody can change the account of someone at their own level or above. The console has:

- **Feedback:** bugs, ideas and questions people send from **Send feedback** in the account menu
  (or the footer). Filter by status and kind, search, reply (they get a notification), leave notes
  only staff see, and move each one along (new, planned, in progress, done, not planned). People
  follow what happens to theirs at /feedback.
- **People:** search by name, username or email; change their display name or username, clear
  their profile text, picture or banner, or mark their email as confirmed; sign someone out
  everywhere, or ban them from Game Central (for a set time or for good), which also signs them out.
  Admins can also delete an account, optionally with everything it wrote.
- **Posts and messages:** find anything written on Game Central by words, author or community, and
  remove what breaks the rules (with a reason). Removals show in the community's audit log too.
- **Reports:** open reports from every community, to step in where a community doesn't.
- **Communities:** search, and for each one (admins and the owner):
  - **Give a plan:** Plus or Pro for free, for 1–24 months or for good. It doesn't touch Stripe
    and sits alongside any subscription (the better plan wins). Gifts that run out end on their
    own within the hour. Community managers see it on their Plan & billing page.
  - **Suspend:** take it offline for breaking the rules, with a reason the owner is told. Its pages
    say it's suspended and it leaves Explore. Nothing is deleted, and the suspension can be lifted.
- **Staff:** add people as moderators (or admins, for the owner), change roles, and remove them.
- **Log:** everything staff have done.

**Making yourself an admin:** put your email in `PLATFORM_ADMIN_EMAILS` to be the owner (once
you've confirmed it), or after signing up run
`pnpm --filter @gamecentral/db admin:grant you@example.com` (on the server with Docker:
`docker compose run --rm migrate pnpm --filter @gamecentral/db admin:grant you@example.com`). Add
`--revoke` to take it away. Then add the rest of your team from the Staff page.

## Notifications, search and installing

- **Push notifications** reach phones and computers even with Game Central closed (not while you're
  using Game Central somewhere else). People turn them on per device in Settings → Notifications. On
  iPhone and iPad they work once Game Central is added to the Home Screen.
  - New servers set up with `scripts/linux/server-env.sh` get push keys automatically. For a
    server set up before, run `bash scripts/linux/push-keys.sh` in the Game Central folder, then
    `docker compose up -d`. Elsewhere, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (make a pair
    with `npx web-push generate-vapid-keys`). Without keys the push setting is hidden.
- **Email round-ups:** people can ask for a daily or weekly email of notifications they haven't
  read (Settings → Notifications). It's only sent when there's something new.
- **Install as an app:** Game Central has a web app manifest and icons, so browsers offer to install
  it (Chrome's install button, Safari's Add to Home Screen).
- **Search engines and link previews:** `/sitemap.xml` lists public communities and listed
  servers, `/robots.txt` keeps search engines out of settings and sign-in pages, and links to a
  community show a preview card in its own colours.

## Terms, privacy and your data

- **Terms of Service** (`/legal/terms`) and **Privacy Policy** (`/legal/privacy`) are linked from
  the footer and the sign-up form. They're written for a typical Game Central site; read them through
  and adjust them for your own (edit `apps/web/src/app/legal/*/page.tsx`). Set `CONTACT_EMAIL` to
  show an address for questions.
- **Agreeing:** signing up asks people to confirm they're 13 or older and agree. Anyone who hasn't
  (for example after signing up with Discord) is asked before anything else. When you change the
  terms in a way people should agree to again, raise `CURRENT_TERMS_VERSION` in
  `packages/shared/src/legal.ts`.
- **18+ communities:** communities marked "Mature content (18+)" ask visitors to confirm they're
  adults before showing anything.
- **Download your data:** Account settings → Your data gives a JSON file of everything Game Central keeps
  about you.
- **Delete your account:** Account settings → Delete account removes your profile, settings,
  sign-in methods and memberships and signs you out everywhere. What you wrote stays as "Deleted
  user", unless you also choose to remove your chat messages and forum replies. Owners hand over
  or delete their communities first.

## API and webhooks

- **Public API:** people make personal tokens in Settings → Developer; scripts and bots then call
  `/api/v1` with `Authorization: Bearer mx_…`, acting as that person with exactly their access
  (communities, channels, chat messages, forum threads, events, game servers). Tokens read only,
  unless the person lets one post chat messages. Each token gets 120 requests a minute. The docs
  are at **/developers** (linked in the footer).
- **Webhooks:** community managers add them under Settings → Integrations. A Discord webhook URL
  gets readable messages in that Discord channel (announcements, new events, server down/up and
  so on, never pinging anyone); any other `https://` address gets signed JSON. Only content from
  channels everyone in the community can see is sent. Failed deliveries are retried, and a
  webhook that keeps failing switches itself off.

## Custom domains

Communities on the Pro plan can show their pages on their own address (Settings → Custom
domain): the owner enters it, adds a CNAME record pointing at the site and a TXT record that
proves it's theirs, then checks. Once verified, Caddy fetches a certificate on the first visit
(on-demand TLS; it asks Game Central first, so only verified domains get one). Visitors there see the
community's pages; signing in, settings and the rest of the site send them to the main address.

- Nothing to set up on a server made with `scripts/linux/server-env.sh`: ports 80 and 443 already
  go to Caddy. If people should point their domains somewhere other than `APP_URL`'s host (say,
  a load balancer's name), set `CUSTOM_DOMAIN_TARGET`.
- `DNS_SERVERS` (comma-separated) picks the resolvers used for checking, if the server's own are
  slow to see changes (for example `1.1.1.1,8.8.8.8`).

## Languages

The interface is in English, Spanish, French, German and Brazilian Portuguese. It follows the
browser's language, and people can choose one in Settings → Accessibility & display. Anything not
translated yet shows in English. The terms, privacy policy and developer docs are English only.

Translations live in `apps/web/messages/<language>.json`. `pnpm lint` checks every language
against English: no unknown keys, and the same `{placeholders}` and `<tags>` in each string. To
add a language, add its code to `LOCALES` in `packages/shared/src/locales.ts` and a messages file.

## Error reporting and tracing

Both are off until configured, and their code isn't loaded until then.

- **Sentry:** set `SENTRY_DSN` to get errors from the web app, the realtime server, the worker
  (jobs that fail for good) and people's browsers (pages that break). Anything logged as an error
  is reported too. No user details, cookies, headers or request bodies are sent. Set
  `SENTRY_TRACES_SAMPLE_RATE` (0–1) for performance monitoring as well.
- **OpenTelemetry:** set `OTEL_EXPORTER_OTLP_ENDPOINT` (an OTLP/HTTP collector, e.g. Grafana
  Alloy, the OpenTelemetry Collector, Honeycomb or Jaeger) to export traces: Next.js's own spans
  for pages, route handlers and server actions, and a span for each worker job. Services are
  named `gamecentral-web`, `gamecentral-realtime` and `gamecentral-worker`; `OTEL_TRACES_SAMPLE_RATE` keeps a
  share of them.

## Backups

`scripts/linux/backup.sh` backs up the database, uploaded files (when they're stored on the
server rather than in S3/R2) and `.env` into `backups/<date>`, keeping the newest 14.

- `bash scripts/linux/backup.sh --install-cron` also backs up every night at 03:17.
- Set `BACKUP_RCLONE_REMOTE` (e.g. `r2:gamecentral-backups`, after `rclone config`) to copy each backup
  off the server, and `BACKUP_KEEP` or `BACKUP_DIR` to change how many are kept and where.
- Restore with `bash scripts/linux/restore.sh backups/<date>`: it stops the site, replaces the
  database (in one transaction, so a bad backup changes nothing) and the uploads, and starts it
  again. On a new server, copy the backup's `env` to `.env` first.
- Backups hold the site's secrets (`.env`), so keep them private. With uploads in S3 or R2, turn on
  the bucket's own versioning or replication too.

## Game Central for Windows

`apps/desktop` is a Windows app that shows your Game Central site in its own window. None of the site is
bundled into it, so **every update to the website appears in the app straight away**, with
nothing to reinstall. It adds what a desktop app should have:

- Voice channels work fully: microphone, and screen sharing with a picker for the screen or window
  to share (plus, optionally, the computer's sound).
- Windows notifications, a taskbar progress bar for downloads, spellchecking with suggestions,
  and a right-click menu (copy, paste, copy link, save image).
- Back and forward with Alt+← / Alt+→ or the mouse's side buttons, zoom with Ctrl+= / Ctrl+-,
  F11 for full screen. Press Alt for the menu.
- It remembers its size and position, opens only one copy, and shows a "Can't reach Game Central"
  page that retries by itself when the site is down or you're offline.
- Links to other sites open in your normal browser. Sign-in (Discord, Twitch, Steam) and Stripe
  checkout stay in the app, since they send you back to Game Central.

**Getting the installer:** every push that changes `apps/desktop` builds `GameCentral-Setup-<version>.exe`
on GitHub (Actions → **Windows app** → the latest run → **Artifacts**). You can also start a build
there by hand, optionally for another site address. To build it yourself on Windows:
`cd apps/desktop`, `npm install`, `npm run dist`; the installer lands in `apps/desktop/release`.

- **Which site it opens:** `siteUrl` in `apps/desktop/package.json`. People can point their copy
  elsewhere from the app's menu (Alt → File → Server address…).
- **Updating the app itself** is only needed for changes in `apps/desktop` (rare): raise
  `version` in its `package.json` and build again. The new installer updates the installed app in
  place and keeps people signed in.
- **Unsigned:** Windows SmartScreen warns about apps without a code-signing certificate ("More
  info" → "Run anyway"). A certificate (for example through Azure Trusted Signing) removes the
  warning; electron-builder signs with it during the build.
- **Google sign-in** may refuse to work inside apps like this one (Google blocks embedded browsers).
  Email, Discord, Twitch and Steam sign-in work.

## Scripts

| Command            | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | Run web, realtime and worker with reload             |
| `pnpm lint`        | ESLint (including jsx-a11y via `eslint-config-next`) |
| `pnpm typecheck`   | TypeScript across all packages                       |
| `pnpm test`        | Vitest unit tests                                    |
| `pnpm test:e2e`    | Playwright end-to-end + axe accessibility checks     |
| `pnpm db:generate` | Generate a migration from schema changes             |
| `pnpm db:migrate`  | Apply migrations                                     |
| `pnpm db:seed`     | Seed games and demo data (`SEED_DEMO=false` to skip) |
| `pnpm db:reset`    | Drop, migrate and seed (refuses in production)       |

## Testing

- **Unit tests** cover the permission resolver (with an exhaustive allow/deny table), contrast
  maths and auto-fix, preference parsing, the rich-text sanitiser, block schemas, the SSRF guard
  and the poll scheduler.
- **End-to-end tests** start all three apps. Every main page is scanned with axe (WCAG 2.2 AA) in
  light, dark and high-contrast modes, and the core flows are driven from the keyboard.

If Playwright can't find its browser, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Accessibility

Accessibility is a feature, not a checklist item. The baseline is WCAG 2.2 AA:

- Skip links, landmarks and a proper heading structure on every page.
- Every interactive element works from the keyboard. There's a command palette (Ctrl/Cmd+K) and
  a shortcut list (?).
- Community themes that fail contrast can't be saved, and the editor suggests the nearest
  passing colour.
- Screen reader announcements for chat can be set to all messages, mentions only, or off.

Found a barrier? Please open an issue. Accessibility bugs are treated as high priority.

## Roadmap

- [x] **Phase 0 — Foundation:** monorepo, auth (email, OAuth, 2FA), app shell, design tokens,
      accessibility preferences, command palette, CI with axe
- [x] **Phase 1 — Community hubs:** creation wizard, theme editor, page builder, roles,
      invites, live server status, explore, profiles, uploads
- [x] **Phase 2 — Forum, wiki, notifications, moderation basics:** forum channels with categories
      and per-channel permissions, threads with polls, reactions, voting, flairs, Q&A answers,
      drafts and full-text search; a wiki with revisions, diffs and restore; live and email
      notifications with mutes; reports, blocks, kick/ban/timeout and an audit trail.
- [x] **Phase 3 — Real-time chat:** chat channels with replies, reactions, mentions (@user,
      @role, @everyone), edits, deletes, image and video (MP4/WebM, up to 50 MB) attachments
      with alt text, a full-screen media viewer (zoom, play/pause, download), link previews fetched
      behind the SSRF guard, typing indicators, who's online, read states with unread and
      mention badges, jump to unread, a mentions inbox, pins, slow mode and message search; an
      accessible log with arrow-key navigation and throttled screen reader announcements
- [x] **Phase 4 — Game servers:** a server browser with search, game, tag, region, player and
      online filters; server pages with accessible player and uptime charts (keyboard read-out
      and a table view); status samples in daily partitions with hourly and daily rollups;
      voting once a day with a verified email, optional Cloudflare Turnstile, and NuVotifier /
      Votifier v1 rewards; down and back-up alerts in a chosen chat channel; dormant servers
      paused after a week offline; steam:// connect links and copy-address buttons
- [x] **Phase 5 — Events, applications, moderation, analytics:** events with a calendar,
      RSVPs with places, repeats, time zones, reminders and iCal feeds; applying to join with a
      question form and a review queue; welcome steps with rules to agree to and roles to pick;
      automod (blocked words, link and invite filters, spam and flood limits, new-member checks,
      raid protection) with a mod queue; custom emoji in posts and reactions; an analytics
      dashboard; handing over ownership; archiving
- [x] **Phase 6 — Platform and polish:** an admin console (gift plans, suspend communities, ban
      people, a log); downloading your data and deleting your account; terms, privacy and an
      age gate; sitemaps, share images, an installable app, push notifications and email
      round-ups; a public API with personal tokens and webhooks (signed JSON or Discord);
      custom domains with on-demand certificates; Spanish, French, German and
      Brazilian Portuguese; Sentry and OpenTelemetry; backup and restore scripts
