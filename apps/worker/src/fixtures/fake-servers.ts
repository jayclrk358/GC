/**
 * Local fake game servers for development and end-to-end tests.
 *   Minecraft Server List Ping (TCP)  : FAKE_MC_PORT   (default 25590)
 *   Source A2S query (UDP)            : FAKE_A2S_PORT  (default 27090)
 *   Control API (HTTP)                : FAKE_CTL_PORT  (default 25591)
 *   NuVotifier v2 (TCP)               : FAKE_VOTIFIER_PORT (default 25592), token "fixture-token"
 *
 * The control API lets tests change what the servers report:
 *   POST /minecraft {"motd":"...","online":true,"players":12,"max":100}
 *   POST /source    {"name":"...","online":true,"players":3,"max":24,"map":"de_dust2"}
 *   GET  /health
 *   GET  /page/:name   an HTML page with OpenGraph tags (link preview tests)
 *   GET  /go/:name     a redirect to /page/:name
 *   GET  /og.png       the preview image
 *   GET  /votes        votes the fake NuVotifier accepted, newest last
 * Requires SERVER_QUERY_ALLOW_PRIVATE=true in the app, because these listen on localhost.
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const MC_PORT = Number(process.env.FAKE_MC_PORT ?? 25590);
const A2S_PORT = Number(process.env.FAKE_A2S_PORT ?? 27090);
const CTL_PORT = Number(process.env.FAKE_CTL_PORT ?? 25591);
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

const ctl = createHttpServer((req, res) => {
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
  if (req.method === 'GET' && req.url === '/votes') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ votes }));
    return;
  }
  if (req.method === 'GET' && req.url === '/og.png') {
    res.writeHead(200, { 'content-type': 'image/png' }).end(OG_PNG);
    return;
  }
  if (req.method === 'POST' && (req.url === '/minecraft' || req.url === '/source')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const patch = JSON.parse(body || '{}');
        const key = req.url === '/minecraft' ? 'minecraft' : 'source';
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
