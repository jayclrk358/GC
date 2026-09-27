/**
 * Demo users, communities and servers for local development and screenshots.
 * Skipped in production and when SEED_DEMO=false. Idempotent: existing demo data is left alone.
 */
import { and, eq, lt, sql as dsql } from 'drizzle-orm';
import { db, schema, sql } from '@magnox/db';
import {
  addBlock,
  backfillHistory,
  closeRedis,
  createCommunity,
  createReply,
  createThread,
  createWikiPage,
  ensureChatChannels,
  ensureSamplePartitions,
  ensureStarterContent,
  env,
  getMemberContext,
  joinCommunity,
  listRoles,
  listVisibleChannels,
  markSolution,
  moderateThread,
  sendMessage,
  setMessagePinned,
  toggleMessageReaction,
  setMemberRole,
  toggleReaction,
  updateCommunityTheme,
  updateProfile,
  updateWikiPage,
  voteThread,
} from '@magnox/core';
import { docFromText, newId, randomToken, themeFromPreset, type RichNode } from '@magnox/shared';
import { auth } from './index';

const PASSWORD = 'magnox-demo-1234';

const USERS = [
  { name: 'Alice Moreno', username: 'alice', email: 'alice@demo.magnox.local' },
  { name: 'Bob Okafor', username: 'bob', email: 'bob@demo.magnox.local' },
  { name: 'Carol Nguyen', username: 'carol', email: 'carol@demo.magnox.local' },
];

async function ensureUser(u: (typeof USERS)[number]): Promise<string> {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, u.email) });
  if (existing) return existing.id;
  const res = await auth().api.signUpEmail({ body: { ...u, password: PASSWORD } });
  await db
    .update(schema.users)
    .set({ emailVerified: true })
    .where(eq(schema.users.id, res.user.id));
  return res.user.id;
}

const text = (t: string): RichNode => ({ type: 'text', text: t });
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });
const h = (level: 2 | 3, t: string): RichNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(t)],
});
const ul = (...items: string[]): RichNode => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [p(text(i))] })),
});
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content });

/** A handful of threads, replies and wiki pages so a fresh install doesn't look empty. */
async function seedContent(
  communityId: string,
  name: string,
  users: { alice: string; bob: string; carol: string },
) {
  const as = (u: string) => getMemberContext({ id: communityId }, u);
  const [a, b, c] = await Promise.all([as(users.alice), as(users.bob), as(users.carol)]);
  const threads = await db.query.threads.findFirst({
    where: eq(schema.threads.communityId, communityId),
  });
  if (!threads) await seedForum(name, users, a, b, c);
  const hasRules = await db.query.wikiPages.findFirst({
    where: (w, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(w.communityId, communityId), eqFn(w.slug, 'rules')),
  });
  if (!hasRules) await seedWiki(communityId, name, a, b);
  const chatted = await db.query.messages.findFirst({
    where: eq(schema.messages.communityId, communityId),
  });
  if (!chatted) await seedChat(name, users, a, b, c);
}

async function seedChat(
  name: string,
  users: { alice: string; bob: string; carol: string },
  a: Ctx,
  b: Ctx,
  c: Ctx,
) {
  const { channels } = await listVisibleChannels(a, { types: ['text'] });
  const lounge = channels[0];
  if (!lounge) return;
  const hello = await sendMessage(a, lounge.id, {
    body: docFromText(
      `Welcome to the ${name} chat! Be kind, have fun, and use threads in the forum for anything long.`,
    ),
  });
  await setMessagePinned(a, hello.id, true);
  const q = await sendMessage(b, lounge.id, {
    body: docFromText('Anyone around for a session tonight?'),
  });
  await sendMessage(c, lounge.id, {
    body: doc(
      p(
        text("I'm in! "),
        { type: 'mention', attrs: { id: users.bob, label: 'bob', kind: 'user' } },
        text(' what time works?'),
      ),
    ),
    replyToId: q.id,
  });
  await sendMessage(b, lounge.id, {
    body: docFromText('Around 8pm? I will post in here when I am on.'),
  });
  await toggleMessageReaction(a, q.id, '👍');
  await toggleMessageReaction(c, q.id, '👍');
  await toggleMessageReaction(a, hello.id, '🎉');
}

type Ctx = Awaited<ReturnType<typeof getMemberContext>>;

async function seedForum(
  name: string,
  users: { alice: string; bob: string; carol: string },
  a: Ctx,
  b: Ctx,
  c: Ctx,
) {
  const { channels } = await listVisibleChannels(a!, { types: ['forum', 'announcement'] });
  const announce = channels.find((ch) => ch.type === 'announcement');
  const forums = channels.filter((ch) => ch.type === 'forum');
  const general = forums.find((ch) => !ch.settings.qa) ?? forums[0];
  const qa = forums.find((ch) => ch.settings.qa);
  const voting =
    forums.find((ch) => ch.settings.voting && ch.id !== general?.id) ??
    forums.find((ch) => ch.settings.voting);

  if (announce) {
    const { id } = await createThread(a, {
      channelId: announce.id,
      title: `Welcome to ${name}!`,
      body: doc(
        p(
          text(
            `Hi everyone, and welcome. This forum is the place for anything that should stick around longer than a chat message.`,
          ),
        ),
        p(
          text(
            'Please read the rules in the wiki, introduce yourself in the general channel and have fun.',
          ),
        ),
      ),
    });
    await moderateThread(a, id, { pinned: true });
  }
  if (general) {
    const { id } = await createThread(b, {
      channelId: general.id,
      title: 'Introduce yourself 👋',
      body: docFromText(
        "I'll start: I'm Bob, I mostly play in the evenings and I'm always up for co-op. What about you?",
      ),
      poll: {
        question: 'When do you usually play?',
        options: ['Mornings', 'Afternoons', 'Evenings', 'Late nights'],
        multiple: true,
        closesInHours: 0,
      },
    });
    const r1 = await createReply(c, id, {
      body: doc(
        p(
          text('Carol here! Weekends mostly. '),
          { type: 'mention', attrs: { id: users.bob, label: 'bob', kind: 'user' } },
          text(' we should team up sometime.'),
        ),
      ),
    });
    await createReply(a, id, {
      body: docFromText('Welcome both of you. Glad to have you here!'),
      replyToId: r1.id,
    });
    await toggleReaction(a, r1.id, '❤️');
    await toggleReaction(b, r1.id, '👍');
  }
  if (qa) {
    const { id } = await createThread(c, {
      channelId: qa.id,
      title: 'How do I get whitelisted / join the group?',
      body: docFromText(
        "I've joined the community here but I'm not sure what the next step is. Is there a form?",
      ),
    });
    const answer = await createReply(b, id, {
      body: docFromText(
        'No form needed. Post your in-game name in the general channel and one of the staff will add you within a day.',
      ),
    });
    await markSolution(c, id, answer.id);
  }
  if (voting) {
    const { id } = await createThread(c, {
      channelId: voting.id,
      title: 'Idea: monthly community showcase',
      body: docFromText(
        'Once a month we could vote on the best builds, clips or guides and feature them on the home page.',
      ),
    });
    await voteThread(a, id, 1);
    await voteThread(b, id, 1);
  }
}

async function seedWiki(communityId: string, name: string, a: Ctx, b: Ctx) {
  const rules = await createWikiPage(a, {
    title: 'Rules',
    summary: 'First draft of the rules',
    body: doc(
      p(
        text(
          `These rules keep ${name} a friendly place. Moderators may act on anything that breaks their spirit, not just their letter.`,
        ),
      ),
      h(2, 'Be kind'),
      ul('No harassment, hate speech or personal attacks.', 'Disagree with ideas, not people.'),
      h(2, 'Keep it on topic'),
      ul('Use the right channel.', 'No spam, advertising or unsolicited DMs.'),
      h(2, 'Play fair'),
      ul(
        'No cheating, exploits or griefing.',
        'Report problems to staff instead of taking revenge.',
      ),
    ),
  });
  const page = await db.query.wikiPages.findFirst({
    where: (w, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(w.communityId, communityId), eqFn(w.slug, rules.slug)),
  });
  if (page) {
    await updateWikiPage(b, page.id, {
      title: 'Rules',
      summary: 'Added a section on reporting',
      baseRevisionId: page.currentRevisionId,
      body: doc(
        ...(page.body.content ?? []),
        h(2, 'Reporting'),
        p(
          text(
            'Use the Report option on any post. Reports go straight to the moderators and stay anonymous.',
          ),
        ),
      ),
    });
  }
  await createWikiPage(b, {
    title: 'FAQ',
    summary: 'Common questions',
    body: doc(
      h(2, 'How do I join?'),
      p(text('Press Join on the community page. Some communities need an invite link.')),
      h(2, 'Where do I ask for help?'),
      p(text('Use the help or support forum and mark the answer that solved it.')),
    ),
  });
}

/**
 * A week of believable status history for the demo server (busy evenings, one short outage), plus
 * older hourly rollups so the 30-day chart has something to show. Skipped once it has history.
 */
async function seedServerHistory(communityId: string, voters: string[]) {
  const server = await db.query.gameServers.findFirst({
    where: and(
      eq(schema.gameServers.communityId, communityId),
      eq(schema.gameServers.name, 'Blockhaven Survival'),
    ),
  });
  if (!server) return;
  const endpointId = server.endpointId;
  const now = Date.now();
  const HOUR = 3600_000;
  const seeded = await db.query.serverRollupsHourly.findFirst({
    where: and(
      eq(schema.serverRollupsHourly.endpointId, endpointId),
      lt(schema.serverRollupsHourly.hour, new Date(now - 8 * 24 * HOUR)),
    ),
  });
  if (seeded) return;

  // Players follow the (UTC) evening: quiet mornings, a peak around 20:00, weekends busier.
  const players = (t: number) => {
    const d = new Date(t);
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    const fromPeak = Math.min(Math.abs(h - 20), 24 - Math.abs(h - 20));
    const evening = Math.exp(-(fromPeak ** 2) / 12);
    const weekend = [0, 6].includes(d.getUTCDay()) ? 1.35 : 1;
    const wobble = Math.sin(t / 1_700_000) * 2;
    return Math.max(0, Math.round((4 + 38 * evening) * weekend + wobble));
  };
  const outageStart = now - 3 * 24 * HOUR - 5 * HOUR;
  const down = (t: number) => t >= outageStart && t < outageStart + 1.5 * HOUR;

  await ensureSamplePartitions(3, now, 8);
  const rows = [];
  for (let t = now - 7 * 24 * HOUR; t < now - 10 * 60_000; t += 5 * 60_000) {
    const online = !down(t);
    rows.push({
      endpointId,
      ts: new Date(t),
      online,
      players: online ? players(t) : null,
      pingMs: online ? 28 + Math.round(Math.random() * 12) : null,
    });
  }
  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(schema.serverSamples)
      .values(rows.slice(i, i + 1000))
      .onConflictDoNothing();
  }
  await backfillHistory(now);

  // Days 8-30 only exist as rollups (raw samples are kept a week).
  const hourly = [];
  const firstRaw = Math.floor((now - 7 * 24 * HOUR) / HOUR) * HOUR;
  for (let t = firstRaw - 23 * 24 * HOUR; t < firstRaw; t += HOUR) {
    const p = players(t + HOUR / 2);
    hourly.push({
      endpointId,
      hour: new Date(t),
      samples: 12,
      onlineSamples: 12,
      avgPlayers: p,
      peakPlayers: p + 3,
    });
  }
  await db.insert(schema.serverRollupsHourly).values(hourly).onConflictDoNothing();
  await backfillHistory(now);

  // Chat alerts go to the first chat channel, and a couple of friendly votes from last week.
  const channel = await db.query.channels.findFirst({
    where: and(eq(schema.channels.communityId, communityId), eq(schema.channels.type, 'text')),
    orderBy: (c, { asc }) => [asc(c.position)],
  });
  await db
    .update(schema.gameServers)
    .set({
      alertChannelId: channel?.id ?? null,
      voteCount: dsql`${schema.gameServers.voteCount} + ${voters.length}`,
    })
    .where(eq(schema.gameServers.id, server.id));
  for (const [i, userId] of voters.entries()) {
    await db.insert(schema.serverVotes).values({
      id: newId(),
      serverId: server.id,
      userId,
      createdAt: new Date(now - (2 + i) * 24 * HOUR),
    });
  }
  console.log('✔ server history for Blockhaven Survival');
}

/** Filled-in profiles, so the profile page shows what it can do. */
async function seedProfiles(users: { alice: string; bob: string; carol: string }) {
  await updateProfile(users.alice, {
    bio: 'Builder and wiki gardener for Blockhaven. Ask me about redstone.',
    pronouns: 'she/her',
    location: 'Lisbon',
    status: 'Planning the next build contest 🧱',
    timezone: 'Europe/Lisbon',
    languages: ['en', 'pt'],
    platforms: ['pc', 'switch'],
    playstyles: ['building', 'creative', 'social'],
    nowPlaying: 'minecraft',
    favoriteGames: ['minecraft', 'stardew-valley', 'satisfactory'],
    accounts: { discord: 'alice.builds', minecraft: 'AliceBuilds', twitch: 'alicebuilds' },
  });
  await updateProfile(users.bob, {
    bio: 'Entry fragger for Neon Arcade. Scrims Tue/Thu, always up for a duo queue.',
    pronouns: 'he/him',
    location: 'Lagos',
    status: 'Grinding ranked tonight 🎯',
    timezone: 'Africa/Lagos',
    languages: ['en', 'fr'],
    platforms: ['pc', 'playstation'],
    playstyles: ['competitive', 'pvp'],
    lookingForGroup: true,
    nowPlaying: 'cs2',
    favoriteGames: ['cs2', 'valorant', 'rocket-league'],
    accounts: { steam: 'bob-okafor', playstation: 'BobOkafor', discord: 'bob.ok' },
  });
  await updateProfile(users.carol, {
    bio: 'Cosy games, farming sims and the occasional Roblox obby.',
    pronouns: 'they/them',
    location: 'Hanoi',
    timezone: 'Asia/Ho_Chi_Minh',
    languages: ['en', 'ja'],
    platforms: ['switch', 'mobile', 'pc'],
    playstyles: ['casual', 'exploring', 'completionist'],
    nowPlaying: 'stardew-valley',
    favoriteGames: ['stardew-valley', 'roblox', 'terraria'],
    accounts: { nintendo: 'SW-1234-5678-9012', roblox: 'CarolPlays' },
  });
  console.log('✔ demo profiles');
}

async function main() {
  if (env().NODE_ENV === 'production' || process.env.SEED_DEMO === 'false') {
    console.log('– demo seed skipped');
    return;
  }
  const [alice, bob, carol] = await Promise.all(USERS.map(ensureUser));
  console.log('✔ demo users (password: %s): alice, bob, carol', PASSWORD);
  await seedProfiles({ alice, bob, carol });

  const communities = [
    {
      slug: 'blockhaven',
      name: 'Blockhaven',
      tagline: 'Friendly survival Minecraft with weekly build contests.',
      gameId: 'minecraft',
      template: 'server' as const,
      preset: 'forest',
      tags: ['survival', 'building', 'java'],
      region: 'europe-west' as const,
    },
    {
      slug: 'neon-arcade',
      name: 'Neon Arcade League',
      tagline: 'Competitive CS2 clan. Scrims every Tuesday and Thursday.',
      gameId: 'cs2',
      template: 'clan' as const,
      preset: 'arcade',
      tags: ['competitive', 'scrims'],
      region: 'na-east' as const,
    },
    {
      slug: 'stardew-friends',
      name: 'Stardew Friends',
      tagline: 'Cosy co-op farming, guides and mod recommendations.',
      gameId: 'stardew-valley',
      template: 'fanhub' as const,
      preset: 'parchment',
      tags: ['co-op', 'mods', 'guides'],
      region: 'global' as const,
    },
    {
      slug: 'midnight-raiders',
      name: 'Midnight Raiders',
      tagline: 'Late-night raids, streams and a very chill Discord.',
      gameId: 'destiny-2',
      template: 'creator' as const,
      preset: 'midnight',
      tags: ['raids', 'streams'],
      region: 'na-west' as const,
    },
  ];

  for (const c of communities) {
    const exists = await db.query.communities.findFirst({
      where: eq(schema.communities.slug, c.slug),
    });
    if (exists) {
      await ensureStarterContent(exists.id);
      await ensureChatChannels(exists.id);
      await seedContent(exists.id, exists.name, { alice: alice!, bob: bob!, carol: carol! });
      await seedServerHistory(exists.id, [bob!, carol!]);
      continue;
    }
    const { id } = await createCommunity(alice!, { ...c, visibility: 'public', joinMode: 'open' });
    const ownerCtx = await getMemberContext({ id }, alice!);
    await updateCommunityTheme(ownerCtx, { ...themeFromPreset(c.preset as never) });
    for (const u of [bob, carol]) await joinCommunity(await getMemberContext({ id }, u!));
    const roles = (await listRoles(id)).filter((r) => !r.isDefault);
    if (roles[1]) await setMemberRole(ownerCtx, bob!, roles[1].id, true);
    await addBlock(ownerCtx, 'richText', {
      heading: 'Getting started',
      doc: docFromText(`Welcome to ${c.name}! Introduce yourself, read the rules and say hi.`),
    });

    if (c.slug === 'blockhaven' && env().SERVER_QUERY_ALLOW_PRIVATE) {
      // Points at the local fake Minecraft server (pnpm --filter @magnox/worker fixtures:servers).
      const endpointId = newId();
      await db
        .insert(schema.serverEndpoints)
        .values({
          id: endpointId,
          protocol: 'minecraft',
          host: '127.0.0.1',
          port: 25590,
          resolvedIp: '127.0.0.1',
        })
        .onConflictDoNothing();
      const endpoint = await db.query.serverEndpoints.findFirst({
        where: eq(schema.serverEndpoints.port, 25590),
      });
      await db.insert(schema.gameServers).values({
        id: newId(),
        endpointId: endpoint!.id,
        communityId: id,
        ownerId: alice!,
        gameId: 'minecraft',
        name: 'Blockhaven Survival',
        description: 'Vanilla+ survival with land claims and a player economy.',
        tags: ['survival', 'economy'],
        region: 'europe-west',
        listed: true,
        verifyToken: `mx-${randomToken(10)}`,
        verifiedAt: new Date(),
      });
    }
    await seedContent(id, c.name, { alice: alice!, bob: bob!, carol: carol! });
    await seedServerHistory(id, [bob!, carol!]);
    console.log(`✔ community /c/${c.slug}`);
  }
}

try {
  await main();
} finally {
  await closeRedis();
  await sql.end();
}
