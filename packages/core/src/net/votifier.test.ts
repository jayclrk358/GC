import { createHmac, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildV1Block, buildV2Frame, parseGreeting, toPem } from './votifier';

const vote = {
  serviceName: 'Magnox',
  username: 'Steve',
  address: '203.0.113.9',
  timestamp: 1790000000000,
};

describe('votifier', () => {
  it('parses greetings', () => {
    expect(parseGreeting('VOTIFIER 2 abc123\n')).toEqual({ version: '2', challenge: 'abc123' });
    expect(parseGreeting('VOTIFIER 1.9')).toEqual({ version: '1.9', challenge: null });
    expect(parseGreeting('SSH-2.0-OpenSSH')).toBeNull();
  });

  it('builds a signed v2 frame', () => {
    const frame = buildV2Frame(vote, 'secret-token', 'chal');
    expect(frame.readUInt16BE(0)).toBe(0x733a);
    const len = frame.readUInt16BE(2);
    expect(frame.length).toBe(4 + len);
    const message = JSON.parse(frame.subarray(4).toString('utf8')) as {
      payload: string;
      signature: string;
    };
    expect(JSON.parse(message.payload)).toEqual({ ...vote, challenge: 'chal' });
    expect(message.signature).toBe(
      createHmac('sha256', 'secret-token').update(message.payload).digest('base64'),
    );
  });

  it('builds a v1 block the server can decrypt', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const block = buildV1Block(vote, der);
    expect(block.length).toBe(256);
    const text = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
      block,
    ).toString('utf8');
    expect(text).toBe('VOTE\nMagnox\nSteve\n203.0.113.9\n1790000000000\n');
  });

  it('wraps bare base64 keys in PEM armour', () => {
    expect(toPem('QUJD')).toBe('-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----\n');
  });
});
