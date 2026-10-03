// Load test setup: the people and communities the virtual users act as. Run on a test database
// (or a staging server's), never on a live one:
//
//   pnpm --filter @gamecentral/loadtest seed --users 1000 --communities 20
//
// Writes apps/loadtest/.data/setup.json, which `load` and `browsers` read. Safe to run again: it
// reuses what's already there.
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '@gamecentral/auth';
import { createCommunity, getMemberContext, joinCommunity, sendMessage } from '@gamecentral/core';
import { db, schema, sql } from '@gamecentral/db';
import { CURRENT_TERMS_VERSION } from '@gamecentral/shared';
import { arg, DATA_DIR, PASSWORD, pool, rng, type SetupData } from './common';

const USERS = Number(arg('users', '1000'));
const COMMUNITIES = Number(arg('communities', '20'));
const MEMBERSHIPS = Number(arg('memberships', '3'));
const HISTORY = Number(arg('history', '30'));

const random = rng(42);
const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!;
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function ensureUsers(): Promise<SetupData['users']> {
  const wanted = Array.from({ length: USERS }, (_, i) => ({
    name: `Load Tester ${i}`,
    username: `lt_${i}`,
    email: `lt.${i}@load.test`,
  }));
  const existing = await db
    .select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .where(
      inArray(
        schema.users.username,
        wanted.map((u) => u.username),
      ),
    );
  const ids = new Map(existing.map((u) => [u.username, u.id]));
  let made = 0;
  await pool(
    wanted.filter((u) => !ids.has(u.username)),
    16,
    async (u) => {
      const { user } = await auth().api.signUpEmail({ body: { ...u, password: PASSWORD } });
      ids.set(u.username, user.id);
      if (++made % 100 === 0) console.log(`  ${made} people signed up`);
    },
  );
  const all = [...ids.values()];
  // Confirmed and agreed to the terms, so they can go straight to it.
  await db.update(schema.users).set({ emailVerified: true }).where(inArray(schema.users.id, all));
  for (let i = 0; i < all.length; i += 500) {
    await db
      .insert(schema.userConsents)
      .values(
        all.slice(i, i + 500).map((userId) => ({
          userId,
          termsVersion: CURRENT_TERMS_VERSION,
          termsAcceptedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: schema.userConsents.userId,
        set: { termsVersion: CURRENT_TERMS_VERSION },
      });
  }
  return wanted.map((u) => ({ ...u, id: ids.get(u.username)! }));
}

async function ensureCommunities(users: SetupData['users']): Promise<SetupData['communities']> {
  const out: SetupData['communities'] = [];
  for (let i = 0; i < COMMUNITIES; i++) {
    const owner = users[i]!;
    const slug = `load-test-${i}`;
    let community = await db.query.communities.findFirst({
      where: eq(schema.communities.slug, slug),
    });
    if (!community) {
      const { id } = await createCommunity(owner.id, {
        name: `Load Test ${i}`,
        slug,
        tagline: 'A community for load testing.',
        template: 'server',
        visibility: 'public',
        joinMode: 'open',
      });
      community = await db.query.communities.findFirst({ where: eq(schema.communities.id, id) });
    }
    const channels = await db
      .select({ id: schema.channels.id, name: schema.channels.name })
      .from(schema.channels)
      .where(and(eq(schema.channels.communityId, community!.id), eq(schema.channels.type, 'text')));
    out.push({ id: community!.id, slug, ownerId: owner.id, channels, members: [owner.id] });
  }
  return out;
}

async function ensureMemberships(users: SetupData['users'], communities: SetupData['communities']) {
  const plan: { userId: string; community: SetupData['communities'][number] }[] = [];
  for (const user of users) {
    const mine = new Set<number>();
    while (mine.size < Math.min(MEMBERSHIPS, communities.length)) {
      mine.add(Math.floor(random() * communities.length));
    }
    for (const i of mine) plan.push({ userId: user.id, community: communities[i]! });
  }
  const current = await db
    .select({ userId: schema.members.userId, communityId: schema.members.communityId })
    .from(schema.members)
    .where(
      inArray(
        schema.members.communityId,
        communities.map((c) => c.id),
      ),
    );
  const have = new Set(current.map((m) => `${m.communityId}:${m.userId}`));
  let joined = 0;
  await pool(plan, 8, async ({ userId, community }) => {
    if (!community.members.includes(userId)) community.members.push(userId);
    if (have.has(`${community.id}:${userId}`)) return;
    await joinCommunity(await getMemberContext({ id: community.id }, userId));
    if (++joined % 500 === 0) console.log(`  ${joined} joins`);
  });
}

async function ensureHistory(communities: SetupData['communities']) {
  for (const community of communities) {
    for (const channel of community.channels) {
      const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
        select count(*)::int as n from messages where channel_id = ${channel.id}`;
      for (let i = n; i < HISTORY; i++) {
        const author = pick(community.members);
        const ctx = await getMemberContext({ id: community.id }, author);
        await sendMessage(ctx, channel.id, {
          body: doc(`Earlier message ${i} in #${channel.name}`),
        });
      }
    }
  }
}

console.log(`Setting up ${USERS} people and ${COMMUNITIES} communities…`);
const users = await ensureUsers();
console.log(`  ${users.length} people ready`);
const communities = await ensureCommunities(users);
await ensureMemberships(users, communities);
console.log(`  memberships ready`);
await ensureHistory(communities);
console.log(`  chat history ready`);
fs.mkdirSync(DATA_DIR, { recursive: true });
const data: SetupData = { password: PASSWORD, users, communities };
fs.writeFileSync(path.join(DATA_DIR, 'setup.json'), JSON.stringify(data));
console.log(`Wrote ${path.join(DATA_DIR, 'setup.json')}`);
await sql.end();
process.exit(0);
