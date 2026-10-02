/**
 * Local fake game servers for development and end-to-end tests.
 *   Minecraft Server List Ping (TCP)  : FAKE_MC_PORT   (default 25590)
 *   Source A2S query (UDP)            : FAKE_A2S_PORT  (default 27090)
 *   Control API (HTTP)                : FAKE_CTL_PORT  (default 25591)
 *   NuVotifier v2 (TCP)               : FAKE_VOTIFIER_PORT (default 25592), token "fixture-token"
 *   Roblox public APIs (HTTP)         : control port under /roblox (set ROBLOX_API_URL to
 *                                       http://127.0.0.1:25591/roblox); place 404 doesn't exist
 *
 * The control API lets tests change what the servers report:
 *   POST /minecraft {"motd":"...","online":true,"players":12,"max":100}
 *   POST /source    {"name":"...","online":true,"players":3,"max":24,"map":"de_dust2"}
 *   GET  /health
 *   GET  /page/:name   an HTML page with OpenGraph tags (link preview tests)
 *   GET  /go/:name     a redirect to /page/:name
 *   GET  /og.png       the preview image
 *   GET  /votes        votes the fake NuVotifier accepted, newest last
 *   POST /push/:id     a fake Web Push service (accepts like one would: 201)
 *   GET  /pushes       what it received, newest last (headers only: the payload is encrypted)
 *   POST /hook/:id     a webhook receiver (answers 204; /hook/fail answers 500)
 *   GET  /hooks        deliveries it received, newest last (headers and parsed body)
 *   PUT|DELETE /discord/api/guilds/:g/members/:u/roles/:r   a fake Discord API (DISCORD_API_URL
 *                      http://127.0.0.1:25591/discord/api); member "404" isn't in the server
 *   GET  /discord/calls   what the fake Discord API was asked to do
 *   POST /dns {"name":"...","type":"TXT|CNAME|A","value":"..."}   add a record to the fake DNS
 *                      server (UDP, FAKE_DNS_PORT, default 25593; set DNS_SERVERS to use it)
 *   Stripe (HTTP)                     : control port, see fake-stripe.ts (STRIPE_API_URL)
 * Requires SERVER_QUERY_ALLOW_PRIVATE=true in the app, because these listen on localhost.
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { handleStripe } from './fake-stripe';

const MC_PORT = Number(process.env.FAKE_MC_PORT ?? 25590);
const A2S_PORT = Number(process.env.FAKE_A2S_PORT ?? 27090);
const CTL_PORT = Number(process.env.FAKE_CTL_PORT ?? 25591);
const DNS_PORT = Number(process.env.FAKE_DNS_PORT ?? 25593);
const VOTIFIER_PORT = Number(process.env.FAKE_VOTIFIER_PORT ?? 25592);
const VOTIFIER_TOKEN = 'fixture-token';

const state = {
  minecraft: {
    motd: 'Fixture Craft — survival & minigames',
    online: true,
    players: 17,
    max: 120,
    version: '1.21.4',
  },
  source: { name: 'Fixture Source Server', online: true, players: 9, max: 24, map: 'de_dust2' },
  roblox: { name: 'Fixture Obby', description: 'An obby for tests.', playing: 42 },
};

// ── Minecraft Server List Ping ──────────────────────────────────────────────
function readVarInt(buf: Buffer, offset: number): { value: number; size: number } {
  let value = 0;
  let size = 0;
  let byte: number;
  do {
    if (offset + size >= buf.length) throw new RangeError('incomplete');
    byte = buf[offset + size]!;
    value |= (byte & 0x7f) << (7 * size);
    size++;
    if (size > 5) throw new Error('VarInt too big');
  } while (byte & 0x80);
  return { value, size };
}

function writeVarInt(n: number): Buffer {
  const out: number[] = [];
  let v = n >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v) byte |= 0x80;
    out.push(byte);
  } while (v);
  return Buffer.from(out);
}

function mcPacket(id: number, payload: Buffer): Buffer {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

function mcString(s: string): Buffer {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([writeVarInt(b.length), b]);
}

const mc = createTcpServer((sock) => {
  let buf = Buffer.alloc(0);
  let handshaken = false;
  sock.setTimeout(5000, () => sock.destroy());
  sock.on('error', () => {});
  sock.on('data', (chunk) => {
    if (!state.minecraft.online) {
      sock.destroy();
      return;
    }
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      let len;
      try {
        len = readVarInt(buf, 0);
      } catch {
        return;
      }
      if (buf.length < len.size + len.value) return;
      const body = buf.subarray(len.size, len.size + len.value);
      buf = buf.subarray(len.size + len.value);
      const id = readVarInt(body, 0);
      const payload = body.subarray(id.size);
      if (id.value === 0x00 && !handshaken) {
        handshaken = true;
      } else if (id.value === 0x00) {
        const json = JSON.stringify({
          version: { name: state.minecraft.version, protocol: 769 },
          players: { max: state.minecraft.max, online: state.minecraft.players, sample: [] },
          description: { text: state.minecraft.motd },
        });
        sock.write(mcPacket(0x00, mcString(json)));
      } else if (id.value === 0x01) {
        sock.write(mcPacket(0x01, payload));
        sock.end();
      }
    }
  });
});

// ── Source A2S (UDP) ─────────────────────────────────────────────────────────
const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const CHALLENGE = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]);
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);

const a2s = createSocket('udp4');
a2s.on('message', (msg, rinfo) => {
  if (!state.source.online || msg.length < 5 || msg.readInt32LE(0) !== -1) return;
  const kind = msg[4];
  let reply: Buffer | null = null;
  if (kind === 0x54) {
    const s = state.source;
    const appId = Buffer.alloc(2);
    appId.writeUInt16LE(730);
    reply = Buffer.concat([
      HEADER,
      Buffer.from([0x49, 0x11]),
      cstr(s.name),
      cstr(s.map),
      cstr('csgo'),
      cstr('Counter-Strike 2'),
      appId,
      Buffer.from([Math.min(255, s.players), Math.min(255, s.max), 0, 0x64, 0x6c, 0x00, 0x01]),
      cstr('1.40.0.0'),
      Buffer.from([0x00]),
    ]);
  } else if (kind === 0x55) {
    const challenge = msg.subarray(5, 9);
    if (challenge.equals(HEADER) || challenge.length < 4) {
      reply = Buffer.concat([HEADER, Buffer.from([0x41]), CHALLENGE]);
    } else {
      const players: Buffer[] = [];
      for (let i = 0; i < state.source.players; i++) {
        const score = Buffer.alloc(4);
        score.writeInt32LE(i * 3);
        const dur = Buffer.alloc(4);
        dur.writeFloatLE(60 * (i + 1));
        players.push(Buffer.concat([Buffer.from([i]), cstr(`player${i + 1}`), score, dur]));
      }
      reply = Buffer.concat([
        HEADER,
        Buffer.from([0x44, Math.min(255, state.source.players)]),
        ...players,
      ]);
    }
  } else if (kind === 0x56) {
    reply = Buffer.concat([HEADER, Buffer.from([0x41]), CHALLENGE]);
  }
  if (reply) a2s.send(reply, rinfo.port, rinfo.address);
});

// ── NuVotifier v2 ───────────────────────────────────────────────────────────
interface ReceivedVote {
  serviceName: string;
  username: string;
  address: string;
  timestamp: number;
}
const votes: ReceivedVote[] = [];

const votifier = createTcpServer((socket) => {
  const challenge = randomBytes(12).toString('hex');
  let buffer = Buffer.alloc(0);
  socket.on('error', () => socket.destroy());
  socket.write(`VOTIFIER 2.9 ${challenge}\n`);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 4) return;
    if (buffer.readUInt16BE(0) !== 0x733a) return void socket.destroy();
    const length = buffer.readUInt16BE(2);
    if (buffer.length < 4 + length) return;
    const reply = (body: object) => socket.end(JSON.stringify(body) + '\r\n');
    try {
      const { payload, signature } = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
      const expected = createHmac('sha256', VOTIFIER_TOKEN).update(payload).digest();
      const given = Buffer.from(String(signature), 'base64');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return reply({ status: 'error', cause: 'Signature is not valid (invalid token?)' });
      }
      const vote = JSON.parse(payload) as ReceivedVote & { challenge: string };
      if (vote.challenge !== challenge) {
        return reply({ status: 'error', cause: 'Challenge is not valid' });
      }
      votes.push({
        serviceName: vote.serviceName,
        username: vote.username,
        address: vote.address,
        timestamp: vote.timestamp,
      });
      reply({ status: 'ok' });
    } catch {
      reply({ status: 'error', cause: 'Malformed vote' });
    }
  });
});

// ── Control API ─────────────────────────────────────────────────────────────
// A 4x4 PNG for link preview images.
const OG_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQqLCBIwbiOABkgw3Be6BngQAAAABJRU5ErkJggg==',
  'base64',
);

const pushes: {
  id: string;
  bytes: number;
  encoding: string;
  authorization: string;
  ttl: string;
}[] = [];

const hooks: { id: string; headers: Record<string, string>; body: unknown }[] = [];
const discordCalls: { method: string; guild: string; user: string; role: string; bot: boolean }[] =
  [];

const ctl = createHttpServer((req, res) => {
  if (handleStripe(req, res)) return;
  if (req.method === 'GET' && req.url === '/health') {
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ status: 'ok', state }));
    return;
  }
  const page = req.url?.match(/^\/page\/([a-z0-9-]{1,40})$/);
  if (req.method === 'GET' && page) {
    const name = page[1]!;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(`<!doctype html><html><head>
      <title>ignored</title>
      <meta property="og:title" content="Fixture page ${name}">
      <meta property="og:description" content="A page served by the local fixtures for link preview tests.">
      <meta property="og:site_name" content="Magnox Fixtures">
      <meta property="og:image" content="/og.png">
      </head><body><h1>${name}</h1></body></html>`);
    return;
  }
  const go = req.url?.match(/^\/go\/([a-z0-9-]{1,40})$/);
  if (req.method === 'GET' && go) {
    res.writeHead(302, { location: `/page/${go[1]}` }).end();
    return;
  }
  const push = req.url?.match(/^\/push\/([a-zA-Z0-9_-]{1,64})$/);
  if (req.method === 'POST' && push) {
    let size = 0;
    req.on('data', (c: Buffer) => (size += c.length));
    req.on('end', () => {
      pushes.push({
        id: push[1]!,
        bytes: size,
        encoding: String(req.headers['content-encoding'] ?? ''),
        authorization: String(req.headers.authorization ?? '').split(' ')[0] ?? '',
        ttl: String(req.headers.ttl ?? ''),
      });
      res.writeHead(201).end();
    });
    return;
  }
  const hook = req.url?.match(/^\/hook\/([a-zA-Z0-9_-]{1,64})$/);
  if (req.method === 'POST' && hook) {
    let body = '';
    req.on('data', (c: Buffer) => (body += c));
    req.on('end', () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        // Recorded as null.
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.startsWith('x-magnox-') || k === 'content-type' || k === 'user-agent') {
          headers[k] = String(v);
        }
      }
      // The raw body too, so tests can check the signature.
      hooks.push({ id: hook[1]!, headers: { ...headers, raw: body }, body: parsed });
      res.writeHead(hook[1] === 'fail' ? 500 : 204).end();
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/hooks') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ hooks }));
    return;
  }
  const role = req.url?.match(/^\/discord\/api\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/);
  if ((req.method === 'PUT' || req.method === 'DELETE') && role) {
    discordCalls.push({
      method: req.method,
      guild: role[1]!,
      user: role[2]!,
      role: role[3]!,
      bot: String(req.headers.authorization ?? '').startsWith('Bot '),
    });
    if (role[2] === '404') {
      res
        .writeHead(404, { 'content-type': 'application/json' })
        .end(JSON.stringify({ message: 'Unknown Member', code: 10007 }));
    } else res.writeHead(204).end();
    return;
  }
  if (req.method === 'POST' && req.url === '/dns') {
    let body = '';
    req.on('data', (c: Buffer) => (body += c));
    req.on('end', () => {
      try {
        const r = JSON.parse(body) as DnsRecord & { name: string };
        const name = r.name.toLowerCase();
        dnsRecords.set(name, [...(dnsRecords.get(name) ?? []), { type: r.type, value: r.value }]);
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/discord/calls') {
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ discordCalls }));
    return;
  }
  if (req.method === 'GET' && req.url === '/pushes') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ pushes }));
    return;
  }
  if (req.method === 'GET' && req.url === '/votes') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ votes }));
    return;
  }
  if (req.method === 'GET' && req.url === '/og.png') {
    res.writeHead(200, { 'content-type': 'image/png' }).end(OG_PNG);
    return;
  }
  // Roblox: place id → universe id (place + 1000), then the game's details.
  const universe = req.url?.match(/^\/roblox\/universes\/v1\/places\/(\d+)\/universe$/);
  if (req.method === 'GET' && universe) {
    if (universe[1] === '404') {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ universeId: Number(universe[1]) + 1000 }));
    return;
  }
  const games = req.url?.match(/^\/roblox\/v1\/games\?universeIds=(\d+)$/);
  if (req.method === 'GET' && games) {
    const id = Number(games[1]);
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        data: [{ id, rootPlaceId: id - 1000, maxPlayers: 30, visits: 123456, ...state.roblox }],
      }),
    );
    return;
  }
  if (
    req.method === 'POST' &&
    (req.url === '/minecraft' || req.url === '/source' || req.url === '/roblox')
  ) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const patch = JSON.parse(body || '{}');
        const key = req.url!.slice(1) as keyof typeof state;
        Object.assign(state[key], patch);
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state[key]));
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }
  res.writeHead(404).end();
});

mc.listen(MC_PORT, '127.0.0.1');
a2s.bind(A2S_PORT, '127.0.0.1');
ctl.listen(CTL_PORT, '127.0.0.1');
votifier.listen(VOTIFIER_PORT, '127.0.0.1');
console.log(
  `fake servers: minecraft tcp/${MC_PORT}, source udp/${A2S_PORT}, control http/${CTL_PORT}, votifier tcp/${VOTIFIER_PORT}`,
);

const stop = () => {
  mc.close();
  a2s.close();
  ctl.close();
  votifier.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// ── Fake DNS (UDP) ──────────────────────────────────────────────────────────
// Answers A, CNAME and TXT questions from records added through POST /dns; anything else gets
// "no such name". Enough for checking custom domains in tests.
interface DnsRecord {
  type: 'A' | 'CNAME' | 'TXT';
  value: string;
}
const dnsRecords = new Map<string, DnsRecord[]>();
const DNS_TYPES: Record<DnsRecord['type'], number> = { A: 1, CNAME: 5, TXT: 16 };

function dnsName(name: string): Buffer {
  const parts = name.split('.').filter(Boolean);
  return Buffer.concat([
    ...parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])),
    Buffer.from([0]),
  ]);
}

const dnsServer = createSocket('udp4');
dnsServer.on('message', (msg, rinfo) => {
  if (msg.length < 17) return;
  let off = 12;
  const labels: string[] = [];
  while (off < msg.length && msg[off] !== 0) {
    const len = msg[off]!;
    labels.push(msg.subarray(off + 1, off + 1 + len).toString());
    off += len + 1;
  }
  off += 1;
  const qtype = msg.readUInt16BE(off);
  const question = msg.subarray(12, off + 4);
  const name = labels.join('.').toLowerCase();
  const answers = (dnsRecords.get(name) ?? [])
    .filter((r) => DNS_TYPES[r.type] === qtype)
    .map((r) => {
      const rdata =
        r.type === 'TXT'
          ? Buffer.concat([Buffer.from([r.value.length]), Buffer.from(r.value)])
          : r.type === 'CNAME'
            ? dnsName(r.value)
            : Buffer.from(r.value.split('.').map(Number));
      const head = Buffer.alloc(12);
      head.writeUInt16BE(0xc00c, 0); // the name in the question
      head.writeUInt16BE(qtype, 2);
      head.writeUInt16BE(1, 4); // IN
      head.writeUInt32BE(60, 6);
      head.writeUInt16BE(rdata.length, 10);
      return Buffer.concat([head, rdata]);
    });
  const header = Buffer.alloc(12);
  header.writeUInt16BE(msg.readUInt16BE(0), 0);
  header.writeUInt16BE(0x8180 | (dnsRecords.has(name) ? 0 : 3), 2); // answer; NXDOMAIN if unknown
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(answers.length, 6);
  dnsServer.send(Buffer.concat([header, question, ...answers]), rinfo.port, rinfo.address);
});
dnsServer.bind(DNS_PORT, '127.0.0.1', () => console.log(`fake DNS on udp ${DNS_PORT}`));
