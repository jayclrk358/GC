import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  getChannelByName,
  getChatChannelByName,
  getCommunityRow,
  getMemberContext,
  isAppError,
  type MemberContext,
} from '@magnox/core';
import { has, normalizeNav, Permission, type NavTab } from '@magnox/shared';
import { getUser } from './auth';

/** Tabs whose features exist. Events arrive in a later phase. */
export const AVAILABLE_TABS: ReadonlySet<NavTab> = new Set([
  'home',
  'forum',
  'chat',
  'wiki',
  'members',
  'servers',
]);

export const loadCommunity = cache(async (slug: string) => {
  const user = await getUser();
  let ctx: MemberContext;
  try {
    ctx = await getMemberContext({ slug }, user?.id ?? null);
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
  const community = await getCommunityRow(ctx.community.id);
  const game = community.gameId
    ? ((await db.query.games.findFirst({ where: eq(schema.games.id, community.gameId) })) ?? null)
    : null;
  const nav = normalizeNav(community.nav).filter((n) => n.visible && AVAILABLE_TABS.has(n.tab));
  const perms = {
    manage: has(ctx.base, Permission.MANAGE_COMMUNITY),
    manageRoles: has(ctx.base, Permission.MANAGE_ROLES),
    manageServers: has(ctx.base, Permission.MANAGE_SERVERS),
    manageInvites: has(ctx.base, Permission.MANAGE_INVITES),
    createInvite: ctx.isMember && has(ctx.base, Permission.CREATE_INVITE),
    viewAudit: has(ctx.base, Permission.VIEW_AUDIT_LOG),
    manageChannels: has(ctx.base, Permission.MANAGE_CHANNELS),
    manageReports: has(ctx.base, Permission.MANAGE_REPORTS),
    ban: has(ctx.base, Permission.BAN_MEMBERS),
    kick: has(ctx.base, Permission.KICK_MEMBERS),
    timeout: has(ctx.base, Permission.TIMEOUT_MEMBERS),
  };
  const canOpenSettings =
    perms.manage ||
    perms.manageRoles ||
    perms.manageServers ||
    perms.manageInvites ||
    perms.viewAudit ||
    perms.manageChannels ||
    perms.manageReports ||
    perms.ban ||
    perms.kick ||
    perms.timeout;
  return { ctx, community, game, nav, user, perms: { ...perms, settings: canOpenSettings } };
});

export type LoadedCommunity = Awaited<ReturnType<typeof loadCommunity>>;

/** Load for a settings page and 404 if the viewer can't manage anything. */
export async function loadCommunityForSettings(slug: string) {
  const data = await loadCommunity(slug);
  if (!data.perms.settings) notFound();
  return data;
}

/** A forum or announcement channel the viewer can see, or a 404. */
export async function loadForumChannel(ctx: MemberContext, name: string) {
  try {
    const channel = await getChannelByName(ctx, decodeURIComponent(name));
    if (channel.type !== 'forum' && channel.type !== 'announcement') notFound();
    return channel;
  } catch (e) {
    if (isAppError(e) && (e.code === 'not_found' || e.code === 'forbidden')) notFound();
    throw e;
  }
}

/** A chat (text) channel the viewer can see, or a 404. */
export async function loadChatChannel(ctx: MemberContext, name: string) {
  try {
    return await getChatChannelByName(ctx, decodeURIComponent(name));
  } catch (e) {
    if (isAppError(e) && (e.code === 'not_found' || e.code === 'forbidden')) notFound();
    throw e;
  }
}
