import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  applyTimeout,
  computeBasePermissions,
  computeChannelPermissions,
  DEFAULT_EVERYONE,
  fromNames,
  has,
  outranks,
  parsePermissions,
  Permission as P,
  TIMEOUT_ALLOWED,
  toNames,
  type Overwrite,
} from './permissions';

const EVERYONE = 'role-everyone';
const MOD = 'role-mod';
const VIP = 'role-vip';
const USER = 'user-1';

const role = (targetId: string, allow = 0n, deny = 0n): Overwrite => ({
  targetType: 'role',
  targetId,
  allow,
  deny,
});
const member = (targetId: string, allow = 0n, deny = 0n): Overwrite => ({
  targetType: 'member',
  targetId,
  allow,
  deny,
});

function chan(base: bigint, layers: Overwrite[][], roles: string[] = [], timedOut = false) {
  return computeChannelPermissions({
    base,
    everyoneRoleId: EVERYONE,
    memberRoleIds: roles,
    userId: USER,
    layers,
    timedOut,
  });
}

describe('computeBasePermissions', () => {
  it('gives the owner everything', () => {
    expect(computeBasePermissions({ isOwner: true, everyone: 0n, roles: [] })).toBe(
      ALL_PERMISSIONS,
    );
  });
  it('ORs @everyone with every held role', () => {
    const perms = computeBasePermissions({
      isOwner: false,
      everyone: P.VIEW_CHANNEL,
      roles: [P.SEND_MESSAGES, P.KICK_MEMBERS],
    });
    expect(perms).toBe(P.VIEW_CHANNEL | P.SEND_MESSAGES | P.KICK_MEMBERS);
  });
  it('short-circuits ADMINISTRATOR to all permissions', () => {
    expect(
      computeBasePermissions({
        isOwner: false,
        everyone: P.VIEW_CHANNEL,
        roles: [P.ADMINISTRATOR],
      }),
    ).toBe(ALL_PERMISSIONS);
  });
});

describe('computeChannelPermissions', () => {
  const base = DEFAULT_EVERYONE;

  it('returns base permissions with no overwrites', () => {
    expect(chan(base, [])).toBe(base);
  });

  it('applies @everyone deny', () => {
    const p = chan(base, [[role(EVERYONE, 0n, P.SEND_MESSAGES)]]);
    expect(has(p, P.SEND_MESSAGES)).toBe(false);
    expect(has(p, P.VIEW_CHANNEL)).toBe(true);
  });

  it('role allow beats @everyone deny', () => {
    const p = chan(
      base,
      [[role(EVERYONE, 0n, P.SEND_MESSAGES), role(MOD, P.SEND_MESSAGES)]],
      [MOD],
    );
    expect(has(p, P.SEND_MESSAGES)).toBe(true);
  });

  it('ignores overwrites for roles the member does not hold', () => {
    const p = chan(
      base,
      [[role(EVERYONE, 0n, P.SEND_MESSAGES), role(MOD, P.SEND_MESSAGES)]],
      [VIP],
    );
    expect(has(p, P.SEND_MESSAGES)).toBe(false);
  });

  it('combines role overwrites: allow wins over deny across roles', () => {
    const p = chan(
      base,
      [[role(MOD, P.MANAGE_MESSAGES), role(VIP, 0n, P.MANAGE_MESSAGES)]],
      [MOD, VIP],
    );
    expect(has(p, P.MANAGE_MESSAGES)).toBe(true);
  });

  it('member overwrite beats role overwrites', () => {
    const p = chan(base, [[role(MOD, P.SEND_MESSAGES), member(USER, 0n, P.SEND_MESSAGES)]], [MOD]);
    expect(has(p, P.SEND_MESSAGES)).toBe(false);
  });

  it('channel layer overrides category layer', () => {
    const category = [role(EVERYONE, 0n, P.VIEW_CHANNEL)];
    const channel = [role(EVERYONE, P.VIEW_CHANNEL)];
    expect(has(chan(base, [category]), P.VIEW_CHANNEL)).toBe(false);
    expect(has(chan(base, [category, channel]), P.VIEW_CHANNEL)).toBe(true);
  });

  it('category deny is inherited when the channel says nothing', () => {
    const category = [role(EVERYONE, 0n, P.SEND_MESSAGES)];
    expect(has(chan(base, [category, []]), P.SEND_MESSAGES)).toBe(false);
  });

  it('without VIEW_CHANNEL a member has nothing', () => {
    expect(chan(base, [[role(EVERYONE, 0n, P.VIEW_CHANNEL)]])).toBe(0n);
  });

  it('without SEND_MESSAGES, mentions/attachments/embeds are also removed', () => {
    const p = chan(base | P.MENTION_EVERYONE, [[role(EVERYONE, 0n, P.SEND_MESSAGES)]]);
    expect(has(p, P.MENTION_EVERYONE)).toBe(false);
    expect(has(p, P.ATTACH_FILES)).toBe(false);
    expect(has(p, P.EMBED_LINKS)).toBe(false);
    expect(has(p, P.ADD_REACTIONS)).toBe(true);
  });

  it('overwrites cannot grant community-level permissions', () => {
    const p = chan(base, [[role(EVERYONE, P.BAN_MEMBERS | P.MANAGE_ROLES | P.ADMINISTRATOR)]]);
    expect(has(p, P.BAN_MEMBERS)).toBe(false);
    expect(has(p, P.MANAGE_ROLES)).toBe(false);
    expect(has(p, P.ADMINISTRATOR)).toBe(false);
  });

  it('administrators ignore overwrites and timeouts', () => {
    const p = chan(ALL_PERMISSIONS, [[role(EVERYONE, 0n, P.VIEW_CHANNEL)]], [], true);
    expect(p).toBe(ALL_PERMISSIONS);
  });

  it('timeouts leave only view and history', () => {
    const p = chan(base, [], [], true);
    expect(p).toBe(TIMEOUT_ALLOWED);
  });

  it('timeouts still respect a view deny', () => {
    expect(chan(base, [[role(EVERYONE, 0n, P.VIEW_CHANNEL)]], [], true)).toBe(0n);
  });

  // Exhaustive check over every combination of @everyone/role/member allow/deny for one bit.
  it('resolves every allow/deny combination in the documented order', () => {
    const bit = P.SEND_MESSAGES;
    const states = ['none', 'allow', 'deny'] as const;
    const mk = (target: 'e' | 'r' | 'm', s: (typeof states)[number]): Overwrite[] => {
      if (s === 'none') return [];
      const allow = s === 'allow' ? bit : 0n;
      const deny = s === 'deny' ? bit : 0n;
      if (target === 'e') return [role(EVERYONE, allow, deny)];
      if (target === 'r') return [role(MOD, allow, deny)];
      return [member(USER, allow, deny)];
    };
    for (const baseHas of [true, false]) {
      for (const e of states)
        for (const r of states)
          for (const m of states) {
            const b = P.VIEW_CHANNEL | (baseHas ? bit : 0n);
            const p = chan(b, [[...mk('e', e), ...mk('r', r), ...mk('m', m)]], [MOD]);
            let expected = baseHas;
            if (e !== 'none') expected = e === 'allow';
            if (r !== 'none') expected = r === 'allow';
            if (m !== 'none') expected = m === 'allow';
            expect(has(p, bit), `base=${baseHas} e=${e} r=${r} m=${m}`).toBe(expected);
          }
    }
  });
});

describe('helpers', () => {
  it('round-trips names', () => {
    const perms = P.KICK_MEMBERS | P.VIEW_CHANNEL;
    expect(fromNames(toNames(perms))).toBe(perms);
  });
  it('parses strings and drops unknown bits', () => {
    expect(parsePermissions(String(P.VIEW_CHANNEL | (1n << 60n)))).toBe(P.VIEW_CHANNEL);
    expect(() => parsePermissions('-1')).toThrow();
    expect(() => parsePermissions('abc')).toThrow();
  });
  it('applyTimeout masks non-admins only', () => {
    expect(applyTimeout(DEFAULT_EVERYONE, true)).toBe(TIMEOUT_ALLOWED & DEFAULT_EVERYONE);
    expect(applyTimeout(ALL_PERMISSIONS, true)).toBe(ALL_PERMISSIONS);
    expect(applyTimeout(DEFAULT_EVERYONE, false)).toBe(DEFAULT_EVERYONE);
  });
  it('outranks follows role positions and owner rules', () => {
    expect(outranks({ isOwner: false, topPosition: 5 }, { isOwner: false, topPosition: 3 })).toBe(
      true,
    );
    expect(outranks({ isOwner: false, topPosition: 3 }, { isOwner: false, topPosition: 3 })).toBe(
      false,
    );
    expect(outranks({ isOwner: true, topPosition: 0 }, { isOwner: false, topPosition: 99 })).toBe(
      true,
    );
    expect(outranks({ isOwner: false, topPosition: 99 }, { isOwner: true, topPosition: 0 })).toBe(
      false,
    );
  });
});
