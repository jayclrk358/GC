# Magnox

Community hubs for games and game servers. Anyone can create a community with a fully
customisable landing page, forum, wiki, events, real-time chat and live game server status.
Magnox is built around two ideas: **deep customisation** and **first-class accessibility**.

> Status: under active development. See [Roadmap](#roadmap) for what is done.

## Highlights

- **Customisable hubs:** themes (with a built-in WCAG contrast checker), fonts, banners and a
  drag-and-drop page builder with keyboard support.
- **Game servers:** link Minecraft, Rust, CS2, FiveM, ARK, Valheim and more. Status and player
  counts update live, with 24-hour, 7-day and 30-day player and uptime charts. A global server
  browser with filters, daily voting (with Minecraft Votifier rewards), and "server down" / "back
  up" alerts posted in chat.
- **Forum, wiki, events and chat:** persistent, searchable discussions plus real-time channels.
- **Roles and permissions:** Discord-style permission bits with category and channel overrides.
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
2. Double-click **`windows-start.cmd`** whenever you want to run Magnox. It opens
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
git clone -b claude/nice-davinci-h3tk5l https://github.com/jayclrk358/Magnox.git magnox
cd magnox
scripts/linux/server-env.sh                     # just this machine: https://localhost
scripts/linux/server-env.sh 192.168.1.50        # or: other devices on your network (your IP)
scripts/linux/server-env.sh magnox.example.com  # or: a domain on the internet
docker compose up -d --build                    # first build takes a few minutes
```

Then open the address the script printed. The script writes `.env` with random secrets (run it
once, before the first start) and makes `docker compose` include `docker-compose.prod.yml`, which
keeps the databases off the network and restarts everything after a reboot.

- **By IP address:** Caddy signs its own certificate, so each browser warns once; continue past
  the warning, or install Caddy's root certificate on your devices
  (`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .`). Uploads use port 8443.
- **With a domain:** point DNS records for `magnox.example.com` and `media.magnox.example.com` at
  the server and open ports 80 and 443. Caddy gets Let's Encrypt certificates automatically.
- **Email:** with `SMTP_URL` empty, mail (sign-up confirmations, password resets) lands in
  Mailpit at http://localhost:8025 on the server. Set `SMTP_URL` in `.env` for real email.
- **Bot protection:** create a Cloudflare Turnstile widget for your domain and put its keys in
  `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `.env`, then `docker compose up -d`. Sign-up,
  sign-in, password resets and server votes then ask for the check.
- **Update:** `git pull && docker compose up -d --build` (migrations run automatically).
- **Logs / stop:** `docker compose logs -f web worker`, `docker compose down` (data stays in
  Docker volumes).
- **Backup:** `docker compose exec postgres pg_dump -U magnox magnox > magnox.sql`, plus the
  `magnox_media` volume (uploads).

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
- [ ] **Phase 5 — Events, applications, automod, analytics**
- [ ] **Phase 6 — Admin console, data export, SEO, PWA, public API, Discord integration**
