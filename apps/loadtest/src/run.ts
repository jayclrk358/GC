// The load test: many people using Game Central at once, the way the web app does it. Each virtual
// person signs in (from an address of their own, as behind a real proxy), opens their community's
// chat with a live connection, and then, at a human pace, chats, reacts, reads, switches channels,
// scrolls back, checks notifications, searches and looks at profiles.
//
//   pnpm --filter @gamecentral/loadtest load --stages 50:60,200:120,500:120
//
// Stages are "people:seconds". Point it at a test or staging copy (--base, --realtime), never at
// a live site: it signs in as the people `seed` made and posts real messages.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { arg, DATA_DIR, rng, Series, sleep, type SetupData } from './common';

const BASE = arg('base', 'http://localhost:3000');
const REALTIME = arg('realtime', 'http://localhost:3001');
const STAGES = arg('stages', '50:60,150:90,300:90')
  .split(',')
  .map((s) => {
    const [users, secs] = s.split(':').map(Number);
    return { users: users!, secs: secs! };
  });
/** How busy each person is: 1 is someone actively chatting (an action every ~10 s). */
const PACE = Number(arg('pace', '1'));
const MANIFEST = arg(
  'manifest',
  path.resolve(DATA_DIR, '../../web/.next/server/server-reference-manifest.json'),
);
const MONITOR = arg('monitor', 'local') === 'local';

const setup = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'setup.json'), 'utf8')) as SetupData;
const random = rng(7);
const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!;

// ── Server actions, called the way the browser calls them ───────────────────

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as {
  node: Record<string, { filename: string; exportedName: string }>;
};
function actionId(name: string): string {
  const found = Object.entries(manifest.node).find(([, v]) => v.exportedName === name);
  if (!found) throw new Error(`No server action ${name} in ${MANIFEST}`);
  return found[0];
}
const ACTIONS = {
  send: actionId('sendMessageAction'),
  react: actionId('toggleMessageReactionAction'),
  ack: actionId('ackChannelAction'),
};

// ── Measurements ─────────────────────────────────────────────────────────────

let series = new Map<string, Series>();
const stat = (label: string) => {
  let s = series.get(label);
  if (!s) series.set(label, (s = new Series()));
  return s;
};
const counters = {
  connectErrors: new Map<string, number>(),
  disconnects: new Map<string, number>(),
};
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** Messages sent, and how many of the people watching that channel got each one. */
const sent = new Map<
  string,
  { at: number; expected: number; received: number; channelId: string }
>();

// ── A virtual person ─────────────────────────────────────────────────────────

interface Person {
  n: number;
  user: SetupData['users'][number];
  ip: string;
  cookie: string;
  socket: Socket | null;
  community: SetupData['communities'][number];
  channel: { id: string; name: string };
  recent: string[];
  seq: number;
  running: boolean;
}

/** Who has each chat open, to know how many should get each message. */
const watching = new Map<string, Set<Person>>();

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 GameCentralLoadTest';

async function request(
  p: Person,
  label: string,
  url: string,
  init: RequestInit & { expect?: 'html' | 'json' | 'action' } = {},
): Promise<{ ok: boolean; status: number; text: string; headers: Headers | null }> {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'user-agent': UA,
        'x-forwarded-for': p.ip,
        origin: BASE,
        ...(p.cookie ? { cookie: p.cookie } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
    const text = await res.text();
    const ms = performance.now() - t0;
    // A page that sends you elsewhere (to sign in, say) didn't work for this person.
    const redirect = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    let ok = res.status < 300;
    let reason = redirect ? `redirect ${redirect.split('?')[0]}` : String(res.status);
    if (ok && init.expect === 'action') {
      const result = actionResult(text);
      ok = result?.ok === true;
      if (!ok) reason = `action: ${result?.error ?? 'no result'}`;
    }
    stat(label).record(ms, ok, ok ? undefined : reason);
    return { ok, status: res.status, text, headers: res.headers };
  } catch (err) {
    stat(label).record(performance.now() - t0, false, (err as Error).name);
    return { ok: false, status: 0, text: '', headers: null };
  }
}

/** The result in a server action's response (its stream's row 1). */
function actionResult(text: string): { ok: boolean; error?: string; data?: unknown } | null {
  for (const line of text.split('\n')) {
    if (line.startsWith('1:')) {
      try {
        return JSON.parse(line.slice(2)) as { ok: boolean; error?: string };
      } catch {
        return null;
      }
    }
  }
  return null;
}

function action(p: Person, label: string, args: unknown[], id: string) {
  return request(p, label, `/c/${p.community.slug}/chat/${p.channel.name}`, {
    method: 'POST',
    expect: 'action',
    headers: {
      'next-action': id,
      accept: 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
    },
    body: JSON.stringify(args),
  });
}

/**
 * The `_rsc` cache-busting value the browser adds to each navigation (a hash of its headers, which
 * only differ by URL here). Learned once per URL from the redirect Next sends without it.
 */
const rscKeys = new Map<string, string>();

/** A client-side navigation: the page's React Server Components payload, not its HTML. */
async function navigate(p: Person, label: string, url: string) {
  const headers = { rsc: '1', 'next-url': url };
  let key = rscKeys.get(url);
  if (!key) {
    const res = await fetch(BASE + url, {
      redirect: 'manual',
      headers: { ...headers, cookie: p.cookie, 'x-forwarded-for': p.ip },
    }).catch(() => null);
    key = new URL(res?.headers.get('location') ?? '/', BASE).searchParams.get('_rsc') ?? '';
    await res?.arrayBuffer().catch(() => null);
    rscKeys.set(url, key);
  }
  return request(p, label, key ? `${url}?_rsc=${key}` : url, { headers });
}

async function signIn(p: Person): Promise<boolean> {
  const res = await request(p, 'sign in', '/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: p.user.email, password: setup.password, rememberMe: true }),
  });
  if (!res.ok || !res.headers) return false;
  p.cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return p.cookie.includes('session_token');
}

function rooms(p: Person): string[] {
  return [
    `community:${p.community.id}`,
    `chat:${p.channel.id}`,
    ...p.community.channels.map((c) => `channel:${c.id}`),
  ];
}

function watch(p: Person, channelId: string, on: boolean) {
  let set = watching.get(channelId);
  if (!set) watching.set(channelId, (set = new Set()));
  if (on) set.add(p);
  else set.delete(p);
}

function connect(p: Person): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let first = true;
    const socket = io(REALTIME, {
      transports: ['websocket'],
      extraHeaders: { cookie: p.cookie, 'x-forwarded-for': p.ip, origin: BASE, 'user-agent': UA },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
    });
    p.socket = socket;
    socket.on('connect', () => {
      if (first) {
        stat('socket connect').record(performance.now() - t0, true);
        first = false;
        resolve();
      }
      for (const room of rooms(p)) socket.emit('subscribe', room);
      watch(p, p.channel.id, true);
      const others = p.community.members.filter((id) => id !== p.user.id).slice(0, 50);
      socket.emit('presence:watch', others, () => {});
      socket.emit('presence:state', 'active');
    });
    socket.on('connect_error', (err) => {
      bump(counters.connectErrors, err.message);
      if (first) {
        stat('socket connect').record(performance.now() - t0, false, err.message);
        first = false;
        resolve();
      }
    });
    socket.on('disconnect', (reason) => {
      watch(p, p.channel.id, false);
      if (p.running) bump(counters.disconnects, reason);
    });
    socket.on('message:new', (payload: { channelId: string; message: { id: string } }) => {
      const marker = /\[lt:([\w-]+):(\d+)\]/.exec(JSON.stringify(payload.message));
      if (payload.channelId === p.channel.id) {
        p.recent.push(payload.message.id);
        if (p.recent.length > 20) p.recent.shift();
      }
      if (!marker) return;
      stat('delivery').record(Date.now() - Number(marker[2]), true);
      const entry = sent.get(marker[1]!);
      if (entry) entry.received++;
    });
  });
}

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const LINES = [
  'anyone up for a match tonight?',
  'gg everyone, that was close',
  'server restart in 10 minutes',
  'lol same',
  'has anyone tried the new map yet?',
  'brb grabbing food',
  'that patch broke my build again',
  'who is hosting the tournament?',
];

async function sendChat(p: Person) {
  p.socket?.emit('typing', p.channel.id);
  await sleep(800 + random() * 2500);
  const key = `${p.n}-${++p.seq}`;
  const expected = watching.get(p.channel.id)?.size ?? 0;
  const at = Date.now();
  sent.set(key, { at, expected, received: 0, channelId: p.channel.id });
  const res = await action(
    p,
    'send message',
    [
      p.community.id,
      p.channel.id,
      { body: doc(`${pick(LINES)} [lt:${key}:${at}]`), nonce: `lt-${key}-${at}` },
    ],
    ACTIONS.send,
  );
  if (!res.ok) sent.delete(key);
}

async function switchChannel(p: Person) {
  const next = pick(p.community.channels.filter((c) => c.id !== p.channel.id));
  if (!next) return;
  p.socket?.emit('unsubscribe', `chat:${p.channel.id}`);
  watch(p, p.channel.id, false);
  p.channel = next;
  p.recent = [];
  await navigate(p, 'page: chat (nav)', `/c/${p.community.slug}/chat/${next.name}`);
  p.socket?.emit('subscribe', `chat:${next.id}`);
  if (p.socket?.connected) watch(p, next.id, true);
  await request(p, 'api: members', `/api/communities/${p.community.id}/chat/members`);
}

const BEHAVIOURS: [number, (p: Person) => Promise<unknown>][] = [
  [34, sendChat],
  [
    8,
    (p) =>
      p.recent.length
        ? action(
            p,
            'react',
            [p.community.id, pick(p.recent), pick(['👍', '😂', '🔥'])],
            ACTIONS.react,
          )
        : Promise.resolve(),
  ],
  [
    10,
    (p) =>
      p.recent.length
        ? action(p, 'mark read', [p.community.id, p.channel.id, p.recent.at(-1)], ACTIONS.ack)
        : Promise.resolve(),
  ],
  [12, switchChannel],
  [6, (p) => navigate(p, 'page: community (nav)', `/c/${p.community.slug}`)],
  [4, (p) => navigate(p, 'page: explore (nav)', '/explore')],
  [3, (p) => navigate(p, 'page: home (nav)', '/')],
  [
    6,
    (p) =>
      request(
        p,
        'api: history',
        `/api/communities/${p.community.id}/chat/${p.channel.id}/messages${p.recent[0] ? `?before=${p.recent[0]}` : ''}`,
      ),
  ],
  [7, (p) => request(p, 'api: notifications', '/api/notifications')],
  [
    3,
    (p) =>
      request(p, 'api: search', `/api/search?q=${pick(['load', 'test', 'match', 'map'])}&limit=6`),
  ],
  [3, (p) => request(p, 'api: mentions', `/api/communities/${p.community.id}/mentions?q=lt_1`)],
  [4, (p) => request(p, 'api: profile card', `/api/users/${pick(setup.users).username}/card`)],
];
const TOTAL = BEHAVIOURS.reduce((s, [w]) => s + w, 0);

async function live(p: Person) {
  p.running = true;
  if (!(await signIn(p))) {
    p.running = false;
    return;
  }
  await request(p, 'page: home (load)', '/', { expect: 'html' });
  await request(p, 'page: chat (load)', `/c/${p.community.slug}/chat/${p.channel.name}`, {
    expect: 'html',
  });
  await request(p, 'api: members', `/api/communities/${p.community.id}/chat/members`);
  await connect(p);
  while (p.running) {
    // Think time: about 10 s between actions for an active chatter, spread out.
    await sleep(((-Math.log(1 - random()) * 10_000) / PACE) | 0);
    if (!p.running) break;
    let roll = random() * TOTAL;
    for (const [weight, act] of BEHAVIOURS) {
      roll -= weight;
      if (roll <= 0) {
        await act(p);
        break;
      }
    }
  }
}

function stop(p: Person) {
  p.running = false;
  watch(p, p.channel.id, false);
  p.socket?.disconnect();
}

// ── Watching the servers (this machine only) ─────────────────────────────────

interface Sample {
  cpu: Record<string, number>;
  rssMb: Record<string, number>;
  dbConnections?: number;
  redisOps?: number;
  redisMemMb?: number;
}
const samples: Sample[] = [];
const PROCESSES: [string, RegExp][] = [
  ['web', /next-server/],
  ['realtime', /apps\/realtime|realtime\/src\/index/],
  ['worker', /apps\/worker|worker\/src\/index/],
  ['postgres', /^postgres|\/postgres /],
  ['redis', /redis-server/],
];
let lastTicks = new Map<number, number>();
let lastAt = Date.now();

function sampleProcesses(): Sample {
  const out: Sample = { cpu: {}, rssMb: {} };
  const now = Date.now();
  const ticks = new Map<number, number>();
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
      const kind = PROCESSES.find(([, re]) => re.test(cmd))?.[0];
      if (!kind || cmd.includes('loadtest')) continue;
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]!.split(' ');
      const used = Number(stat[11]) + Number(stat[12]);
      ticks.set(Number(pid), used);
      const before = lastTicks.get(Number(pid));
      if (before !== undefined) {
        // Clock ticks are hundredths of a second: ticks per second is percent of one core.
        const pct = (used - before) / ((now - lastAt) / 1000);
        out.cpu[kind] = (out.cpu[kind] ?? 0) + pct;
      }
      out.rssMb[kind] = (out.rssMb[kind] ?? 0) + (Number(stat[21]) * 4096) / 1048576;
    } catch {
      // Gone between listing and reading.
    }
  }
  lastTicks = ticks;
  lastAt = now;
  try {
    const info = execFileSync('redis-cli', ['info'], { encoding: 'utf8', timeout: 2000 });
    out.redisOps = Number(/instantaneous_ops_per_sec:(\d+)/.exec(info)?.[1] ?? 0);
    out.redisMemMb = Number(/used_memory:(\d+)/.exec(info)?.[1] ?? 0) / 1048576;
  } catch {
    // No redis-cli here.
  }
  try {
    out.dbConnections = Number(
      execFileSync(
        'psql',
        [process.env.DATABASE_URL ?? '', '-Atc', 'select count(*) from pg_stat_activity'],
        { encoding: 'utf8', timeout: 2000 },
      ).trim(),
    );
  } catch {
    // No psql or no DATABASE_URL.
  }
  return out;
}

// ── The run ──────────────────────────────────────────────────────────────────

const people: Person[] = [];
let nextUser = 0;

function newPerson(): Person {
  const n = nextUser++;
  const user = setup.users[n % setup.users.length]!;
  const mine = setup.communities.filter((c) => c.members.includes(user.id));
  const community = mine.length ? pick(mine) : setup.communities[0]!;
  return {
    n,
    user,
    ip: `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${(n & 255) + 1}`,
    cookie: '',
    socket: null,
    community,
    channel: community.channels[0]!,
    recent: [],
    seq: 0,
    running: false,
  };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function snapshot(label: string, secs: number) {
  const rows = Object.fromEntries([...series.entries()].sort().map(([k, s]) => [k, s.summary()]));
  const settled = [...sent.values()].filter((m) => Date.now() - m.at > 5000);
  const expected = settled.reduce((s, m) => s + m.expected, 0);
  const received = settled.reduce((s, m) => s + Math.min(m.received, m.expected), 0);
  const requests = [...series.entries()]
    .filter(([k]) => k !== 'delivery')
    .reduce((s, [, v]) => s + v.times.length, 0);
  const recentSamples = samples.slice(-Math.max(1, Math.floor(secs / 5)));
  const avg = (key: 'cpu' | 'rssMb', kind: string) =>
    round(recentSamples.reduce((s, x) => s + (x[key][kind] ?? 0), 0) / recentSamples.length);
  const max = (k: 'dbConnections' | 'redisOps') =>
    Math.max(0, ...recentSamples.map((x) => x[k] ?? 0));
  return {
    stage: label,
    people: people.filter((p) => p.running).length,
    connected: people.filter((p) => p.socket?.connected).length,
    requestsPerSecond: round(requests / secs),
    rows,
    delivery: {
      messages: settled.length,
      expected,
      received,
      rate: expected ? round((received / expected) * 100) : 100,
    },
    connectErrors: Object.fromEntries(counters.connectErrors),
    disconnects: Object.fromEntries(counters.disconnects),
    servers: MONITOR
      ? {
          cpuPercent: Object.fromEntries(PROCESSES.map(([k]) => [k, avg('cpu', k)])),
          memoryMb: Object.fromEntries(PROCESSES.map(([k]) => [k, avg('rssMb', k)])),
          dbConnectionsMax: max('dbConnections'),
          redisOpsMax: max('redisOps'),
        }
      : undefined,
  };
}

function print(s: ReturnType<typeof snapshot>) {
  console.log(
    `\n=== ${s.stage}: ${s.people} people (${s.connected} connected), ${s.requestsPerSecond} req/s ===`,
  );
  const table = Object.entries(s.rows).map(([name, r]) => ({
    what: name,
    count: r.count,
    failed: r.failed,
    p50: r.p50,
    p95: r.p95,
    p99: r.p99,
    max: r.max,
  }));
  console.table(table);
  const failures = Object.entries(s.rows).filter(([, r]) => r.failed);
  for (const [name, r] of failures) console.log(`  ${name} failures:`, r.reasons);
  console.log(
    `  delivery: ${s.delivery.received}/${s.delivery.expected} (${s.delivery.rate}%) of ${s.delivery.messages} messages`,
  );
  if (Object.keys(s.connectErrors).length) console.log('  socket connect errors:', s.connectErrors);
  if (Object.keys(s.disconnects).length) console.log('  socket disconnects:', s.disconnects);
  if (s.servers) console.log('  servers:', JSON.stringify(s.servers));
}

const report: ReturnType<typeof snapshot>[] = [];
const sampler = MONITOR ? setInterval(() => samples.push(sampleProcesses()), 5000) : undefined;
if (MONITOR) sampleProcesses();

for (const [i, stage] of STAGES.entries()) {
  series = new Map();
  counters.connectErrors.clear();
  counters.disconnects.clear();
  sent.clear();
  const label = `stage ${i + 1}`;
  console.log(`\n▶ ${label}: going to ${stage.users} people for ${stage.secs}s`);
  const running = () => people.filter((p) => p.running);
  // Arrivals spread over the first third of the stage (at most 60 s), like people logging on.
  const arriving = Math.max(0, stage.users - running().length);
  const spread = Math.min(60_000, (stage.secs * 1000) / 3);
  for (let k = 0; k < arriving; k++) {
    const p = newPerson();
    people.push(p);
    setTimeout(() => void live(p), (spread * k) / Math.max(1, arriving));
  }
  for (const p of running().slice(stage.users)) stop(p);
  const started = Date.now();
  while (Date.now() - started < stage.secs * 1000) {
    await sleep(10_000);
    const health = performance.now();
    await fetch(`${BASE}/api/health`).catch(() => null);
    stat('health').record(performance.now() - health, true);
    const r = series.get('send message')?.summary();
    console.log(
      `  ${Math.round((Date.now() - started) / 1000)}s: ${running().length} people, ${
        people.filter((p) => p.socket?.connected).length
      } connected, send p95 ${r?.p95 ?? '-'}ms, failed requests ${[...series.values()].reduce((s, x) => s + x.failed, 0)}`,
    );
  }
  await sleep(5000);
  const s = snapshot(label, stage.secs);
  print(s);
  report.push(s);
}

for (const p of people) stop(p);
if (sampler) clearInterval(sampler);
fs.mkdirSync(DATA_DIR, { recursive: true });
const file = path.join(DATA_DIR, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ base: BASE, stages: STAGES, pace: PACE, report }, null, 2));
console.log(`\nReport: ${file}`);
process.exit(0);
