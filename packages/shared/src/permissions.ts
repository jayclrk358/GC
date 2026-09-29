/**
 * Discord-style permission bitfield. Stored as int8 in Postgres, handled as bigint
 * in code and serialized as a decimal string over the wire.
 */
export const Permission = {
  // General / channel-scoped
  VIEW_CHANNEL: 1n << 0n,
  SEND_MESSAGES: 1n << 1n,
  CREATE_THREADS: 1n << 2n,
  REPLY_IN_THREADS: 1n << 3n,
  ATTACH_FILES: 1n << 4n,
  EMBED_LINKS: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  MENTION_EVERYONE: 1n << 7n,
  READ_HISTORY: 1n << 8n,
  VOTE: 1n << 9n,
  EDIT_WIKI: 1n << 10n,
  /** Join voice channels (and hear them). */
  CONNECT: 1n << 14n,
  /** Talk (and share a screen) in voice channels. */
  SPEAK: 1n << 15n,
  CREATE_INVITE: 1n << 11n,
  CHANGE_NICKNAME: 1n << 12n,
  RSVP_EVENTS: 1n << 13n,

  // Moderation
  MANAGE_MESSAGES: 1n << 16n,
  MANAGE_THREADS: 1n << 17n,
  MANAGE_WIKI: 1n << 18n,
  MANAGE_EVENTS: 1n << 19n,
  KICK_MEMBERS: 1n << 20n,
  BAN_MEMBERS: 1n << 21n,
  TIMEOUT_MEMBERS: 1n << 22n,
  VIEW_AUDIT_LOG: 1n << 23n,
  MANAGE_REPORTS: 1n << 24n,
  REVIEW_APPLICATIONS: 1n << 25n,
  MANAGE_NICKNAMES: 1n << 26n,
  /** Mute others and remove them from voice channels. */
  MUTE_MEMBERS: 1n << 27n,

  // Administration
  MANAGE_CHANNELS: 1n << 32n,
  MANAGE_ROLES: 1n << 33n,
  MANAGE_COMMUNITY: 1n << 34n,
  MANAGE_SERVERS: 1n << 35n,
  MANAGE_INVITES: 1n << 36n,
  MANAGE_EMOJI: 1n << 37n,
  VIEW_ANALYTICS: 1n << 38n,
  ADMINISTRATOR: 1n << 40n,
} as const;

export type PermissionName = keyof typeof Permission;

export const ALL_PERMISSIONS: bigint = Object.values(Permission).reduce((acc, p) => acc | p, 0n);

/** Permissions that channel overwrites are allowed to change. */
export const CHANNEL_SCOPED: bigint =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.CREATE_THREADS |
  Permission.REPLY_IN_THREADS |
  Permission.ATTACH_FILES |
  Permission.EMBED_LINKS |
  Permission.ADD_REACTIONS |
  Permission.MENTION_EVERYONE |
  Permission.READ_HISTORY |
  Permission.VOTE |
  Permission.EDIT_WIKI |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.MANAGE_MESSAGES |
  Permission.MANAGE_THREADS |
  Permission.MANAGE_WIKI |
  Permission.MUTE_MEMBERS;

/** What a timed-out member keeps. */
export const TIMEOUT_ALLOWED: bigint = Permission.VIEW_CHANNEL | Permission.READ_HISTORY;

/** Default permissions for the @everyone role of a new community. */
export const DEFAULT_EVERYONE: bigint =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.CREATE_THREADS |
  Permission.REPLY_IN_THREADS |
  Permission.ATTACH_FILES |
  Permission.EMBED_LINKS |
  Permission.ADD_REACTIONS |
  Permission.READ_HISTORY |
  Permission.VOTE |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.CREATE_INVITE |
  Permission.CHANGE_NICKNAME |
  Permission.RSVP_EVENTS;

export const DEFAULT_MODERATOR: bigint =
  DEFAULT_EVERYONE |
  Permission.MANAGE_MESSAGES |
  Permission.MANAGE_THREADS |
  Permission.MANAGE_WIKI |
  Permission.MANAGE_EVENTS |
  Permission.EDIT_WIKI |
  Permission.KICK_MEMBERS |
  Permission.TIMEOUT_MEMBERS |
  Permission.VIEW_AUDIT_LOG |
  Permission.MANAGE_REPORTS |
  Permission.REVIEW_APPLICATIONS |
  Permission.MANAGE_NICKNAMES |
  Permission.MUTE_MEMBERS;

export const DEFAULT_ADMIN: bigint = Permission.ADMINISTRATOR;

export type PermissionGroup = 'general' | 'moderation' | 'administration';

export const PERMISSION_META: Record<PermissionName, { group: PermissionGroup; channel: boolean }> =
  {
    VIEW_CHANNEL: { group: 'general', channel: true },
    SEND_MESSAGES: { group: 'general', channel: true },
    CREATE_THREADS: { group: 'general', channel: true },
    REPLY_IN_THREADS: { group: 'general', channel: true },
    ATTACH_FILES: { group: 'general', channel: true },
    EMBED_LINKS: { group: 'general', channel: true },
    ADD_REACTIONS: { group: 'general', channel: true },
    MENTION_EVERYONE: { group: 'general', channel: true },
    READ_HISTORY: { group: 'general', channel: true },
    VOTE: { group: 'general', channel: true },
    EDIT_WIKI: { group: 'general', channel: true },
    CONNECT: { group: 'general', channel: true },
    SPEAK: { group: 'general', channel: true },
    CREATE_INVITE: { group: 'general', channel: false },
    CHANGE_NICKNAME: { group: 'general', channel: false },
    RSVP_EVENTS: { group: 'general', channel: false },
    MANAGE_MESSAGES: { group: 'moderation', channel: true },
    MANAGE_THREADS: { group: 'moderation', channel: true },
    MANAGE_WIKI: { group: 'moderation', channel: true },
    MANAGE_EVENTS: { group: 'moderation', channel: false },
    KICK_MEMBERS: { group: 'moderation', channel: false },
    BAN_MEMBERS: { group: 'moderation', channel: false },
    TIMEOUT_MEMBERS: { group: 'moderation', channel: false },
    VIEW_AUDIT_LOG: { group: 'moderation', channel: false },
    MANAGE_REPORTS: { group: 'moderation', channel: false },
    REVIEW_APPLICATIONS: { group: 'moderation', channel: false },
    MANAGE_NICKNAMES: { group: 'moderation', channel: false },
    MUTE_MEMBERS: { group: 'moderation', channel: true },
    MANAGE_CHANNELS: { group: 'administration', channel: false },
    MANAGE_ROLES: { group: 'administration', channel: false },
    MANAGE_COMMUNITY: { group: 'administration', channel: false },
    MANAGE_SERVERS: { group: 'administration', channel: false },
    MANAGE_INVITES: { group: 'administration', channel: false },
    MANAGE_EMOJI: { group: 'administration', channel: false },
    VIEW_ANALYTICS: { group: 'administration', channel: false },
    ADMINISTRATOR: { group: 'administration', channel: false },
  };

export function has(perms: bigint, flag: bigint): boolean {
  return (perms & flag) === flag;
}

export function toNames(perms: bigint): PermissionName[] {
  return (Object.keys(Permission) as PermissionName[]).filter((k) => has(perms, Permission[k]));
}

export function fromNames(names: readonly string[]): bigint {
  let out = 0n;
  for (const n of names) {
    const flag = (Permission as Record<string, bigint>)[n];
    if (flag !== undefined) out |= flag;
  }
  return out;
}

/** Parse a permission bitfield sent as a decimal string, rejecting unknown bits. */
export function parsePermissions(value: string): bigint {
  if (!/^\d{1,20}$/.test(value)) throw new Error('Invalid permission bitfield');
  return BigInt(value) & ALL_PERMISSIONS;
}

export interface Overwrite {
  targetType: 'role' | 'member';
  targetId: string;
  allow: bigint;
  deny: bigint;
}

export interface BaseInput {
  isOwner: boolean;
  everyone: bigint;
  /** Permissions of every non-@everyone role the member holds. */
  roles: readonly bigint[];
}

/** Community-level permissions: owner → @everyone | roles → ADMINISTRATOR short-circuit. */
export function computeBasePermissions({ isOwner, everyone, roles }: BaseInput): bigint {
  if (isOwner) return ALL_PERMISSIONS;
  let perms = everyone;
  for (const r of roles) perms |= r;
  if (has(perms, Permission.ADMINISTRATOR)) return ALL_PERMISSIONS;
  return perms;
}

export interface ChannelInput {
  base: bigint;
  everyoneRoleId: string;
  memberRoleIds: readonly string[];
  userId: string;
  /** Overwrite layers from outermost (category) to innermost (channel). */
  layers: readonly (readonly Overwrite[])[];
  timedOut: boolean;
}

function applyLayer(
  perms: bigint,
  overwrites: readonly Overwrite[],
  everyoneRoleId: string,
  memberRoleIds: ReadonlySet<string>,
  userId: string,
): bigint {
  let p = perms;
  const everyone = overwrites.find((o) => o.targetType === 'role' && o.targetId === everyoneRoleId);
  if (everyone) p = (p & ~(everyone.deny & CHANNEL_SCOPED)) | (everyone.allow & CHANNEL_SCOPED);

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const o of overwrites) {
    if (o.targetType === 'role' && o.targetId !== everyoneRoleId && memberRoleIds.has(o.targetId)) {
      roleAllow |= o.allow;
      roleDeny |= o.deny;
    }
  }
  p = (p & ~(roleDeny & CHANNEL_SCOPED)) | (roleAllow & CHANNEL_SCOPED);

  const member = overwrites.find((o) => o.targetType === 'member' && o.targetId === userId);
  if (member) p = (p & ~(member.deny & CHANNEL_SCOPED)) | (member.allow & CHANNEL_SCOPED);
  return p;
}

/**
 * Channel-level permissions. Order: base → category overwrites → channel overwrites
 * (each layer: @everyone, then roles combined, then member) → implicit denials → timeout mask.
 */
export function computeChannelPermissions(input: ChannelInput): bigint {
  const { base, everyoneRoleId, userId, layers, timedOut } = input;
  if (has(base, Permission.ADMINISTRATOR)) return ALL_PERMISSIONS;

  const roleSet = new Set(input.memberRoleIds);
  let p = base;
  for (const layer of layers) p = applyLayer(p, layer, everyoneRoleId, roleSet, userId);

  if (!has(p, Permission.VIEW_CHANNEL)) return 0n;
  if (!has(p, Permission.SEND_MESSAGES)) {
    p &= ~(Permission.MENTION_EVERYONE | Permission.ATTACH_FILES | Permission.EMBED_LINKS);
  }
  if (timedOut) p &= TIMEOUT_ALLOWED;
  return p;
}

/** Apply the timeout mask to community-level permissions (admins are exempt). */
export function applyTimeout(base: bigint, timedOut: boolean): bigint {
  if (!timedOut || has(base, Permission.ADMINISTRATOR)) return base;
  return base & TIMEOUT_ALLOWED;
}

/**
 * Role hierarchy check: an actor may act on a target only if the actor's highest role
 * position is strictly above the target's, or the actor is the owner.
 */
export function outranks(
  actor: { isOwner: boolean; topPosition: number },
  target: { isOwner: boolean; topPosition: number },
): boolean {
  if (target.isOwner) return false;
  if (actor.isOwner) return true;
  return actor.topPosition > target.topPosition;
}
