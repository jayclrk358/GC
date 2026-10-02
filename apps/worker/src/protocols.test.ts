import { games, protocols } from 'gamedig';
import { describe, expect, it } from 'vitest';
import {
  isLinkProtocol,
  PROTOCOL_KEYS,
  protocolsForPicker,
  SERVER_PROTOCOLS,
} from '@magnox/shared';

describe('server protocols', () => {
  it('each names a game GameDig knows', () => {
    // A game id, or "protocol-<name>" to speak a protocol directly.
    const known = (type: string) =>
      type.startsWith('protocol-')
        ? Object.hasOwn(protocols, type.slice('protocol-'.length))
        : Object.hasOwn(games, type);
    const unknown = PROTOCOL_KEYS.filter(
      (k) => !isLinkProtocol(k) && !known(SERVER_PROTOCOLS[k].gamedig),
    );
    expect(unknown).toEqual([]);
  });

  it('offers every protocol once when adding a server, Minecraft first', () => {
    const order = protocolsForPicker();
    expect([...order].sort()).toEqual([...PROTOCOL_KEYS].sort());
    expect(order[0]).toBe('minecraft');
    expect(order.at(-1)).toBe('source');
  });

  it('each has a usable default port', () => {
    for (const k of PROTOCOL_KEYS) {
      const port = SERVER_PROTOCOLS[k].defaultPort;
      if (isLinkProtocol(k)) expect(port).toBe(0);
      else expect(port, k).toBeGreaterThan(0);
      if (!isLinkProtocol(k)) expect(port, k).toBeLessThan(65536);
    }
  });
});
