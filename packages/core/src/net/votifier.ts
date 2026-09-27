import { createHmac, constants, publicEncrypt } from 'node:crypto';
import { Socket } from 'node:net';
import { env } from '../env';
import { resolveTarget } from './ssrf';

/**
 * Votifier tells a Minecraft server that someone voted, so the server can reward them. Two wire
 * formats exist: NuVotifier v2 (HMAC-signed JSON, shared token) and the original v1 (an RSA
 * block encrypted with the server's public key). The server announces which it speaks in its
 * greeting line.
 */

export interface VotifierVote {
  serviceName: string;
  username: string;
  address: string;
  /** Milliseconds since the epoch. */
  timestamp: number;
}

const V2_MAGIC = 0x733a;

/** A v2 frame: magic, length, then {"payload": "...", "signature": base64(HMAC-SHA256)}. */
export function buildV2Frame(vote: VotifierVote, token: string, challenge: string): Buffer {
  const payload = JSON.stringify({ ...vote, challenge });
  const signature = createHmac('sha256', token).update(payload).digest('base64');
  const message = Buffer.from(JSON.stringify({ payload, signature }), 'utf8');
  if (message.length > 0xffff) throw new Error('Vote message too large');
  const head = Buffer.alloc(4);
  head.writeUInt16BE(V2_MAGIC, 0);
  head.writeUInt16BE(message.length, 2);
  return Buffer.concat([head, message]);
}

/** Votifier public keys are base64 DER without PEM armour; accept either form. */
export function toPem(publicKey: string): string {
  if (publicKey.includes('BEGIN PUBLIC KEY')) return publicKey;
  const body =
    publicKey
      .replace(/\s+/g, '')
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`;
}

/** A v1 block: "VOTE\n<service>\n<user>\n<address>\n<timestamp>\n", RSA PKCS#1 v1.5 encrypted. */
export function buildV1Block(vote: VotifierVote, publicKey: string): Buffer {
  const text = `VOTE\n${vote.serviceName}\n${vote.username}\n${vote.address}\n${vote.timestamp}\n`;
  return publicEncrypt(
    { key: toPem(publicKey), padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(text, 'utf8'),
  );
}

export function parseGreeting(line: string): { version: string; challenge: string | null } | null {
  const m = line.trim().match(/^VOTIFIER\s+(\S+)(?:\s+(\S+))?$/);
  return m ? { version: m[1]!, challenge: m[2] ?? null } : null;
}

export interface VotifierTarget {
  host: string;
  port: number;
  token: string | null;
  publicKey: string | null;
}

/** Deliver one vote. Resolves on success; rejects with a short, safe message otherwise. */
export async function sendVotifierVote(
  target: VotifierTarget,
  vote: VotifierVote,
  timeoutMs = 6000,
): Promise<void> {
  // Same SSRF guard as server polling: public addresses only (unless the test flag is on).
  const resolved = await resolveTarget(target.host, target.port, {
    allowPrivate: env().SERVER_QUERY_ALLOW_PRIVATE,
  });
  await new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    let buffer = Buffer.alloc(0);
    let greeted = false;
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => done(new Error('The Votifier server did not answer in time.')),
      timeoutMs,
    );
    socket.on('error', () => done(new Error('Could not connect to the Votifier port.')));
    socket.on('close', () =>
      done(greeted ? undefined : new Error('The Votifier server closed the connection.')),
    );
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 64 * 1024)
        return done(new Error('Unexpected reply from the Votifier server.'));
      if (!greeted) {
        const nl = buffer.indexOf(0x0a);
        if (nl < 0) return;
        const greeting = parseGreeting(buffer.subarray(0, nl).toString('utf8'));
        buffer = buffer.subarray(nl + 1);
        if (!greeting) return done(new Error('That port is not a Votifier server.'));
        greeted = true;
        if (greeting.version.startsWith('2') && greeting.challenge && target.token) {
          socket.write(buildV2Frame(vote, target.token, greeting.challenge));
          return;
        }
        if (target.publicKey) {
          // v1 has no reply: the server reads 256 bytes and closes.
          socket.end(buildV1Block(vote, target.publicKey));
          settled = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        return done(
          new Error('The server speaks Votifier v1: add its public key instead of a token.'),
        );
      }
      // v2 reply: one JSON object.
      const text = buffer.toString('utf8').trim();
      if (!text.endsWith('}')) return;
      try {
        const reply = JSON.parse(text) as { status?: string; cause?: string };
        if (reply.status === 'ok') done();
        else
          done(
            new Error(
              `The server rejected the vote${reply.cause ? ` (${String(reply.cause).slice(0, 80)})` : ''}.`,
            ),
          );
      } catch {
        done(new Error('Unexpected reply from the Votifier server.'));
      }
    });
    socket.connect(resolved.port, resolved.ip);
  });
}
