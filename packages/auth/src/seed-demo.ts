/**
 * Demo users, communities and servers for local development and screenshots.
 * Skipped in production and when SEED_DEMO=false. Idempotent: existing demo data is left alone.
 */
import { eq } from 'drizzle-orm';
import { db, schema, sql } from '@magnox/db';
import {
  addBlock,
  closeRedis,
  createCommunity,
  env,
  getMemberContext,
  joinCommunity,
  listRoles,
  setMemberRole,
  updateCommunityTheme,
} from '@magnox/core';
import { docFromText, newId, randomToken, themeFromPreset } from '@magnox/shared';
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
  await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, res.user.id));
  return res.user.id;
}

async function main() {
  if (env().NODE_ENV === 'production' || process.env.SEED_DEMO === 'false') {
    console.log('– demo seed skipped');
    return;
  }
  const [alice, bob, carol] = await Promise.all(USERS.map(ensureUser));
  console.log('✔ demo users (password: %s): alice, bob, carol', PASSWORD);

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
    const exists = await db.query.communities.findFirst({ where: eq(schema.communities.slug, c.slug) });
    if (exists) continue;
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
        .values({ id: endpointId, protocol: 'minecraft', host: '127.0.0.1', port: 25590, resolvedIp: '127.0.0.1' })
        .onConflictDoNothing();
      const endpoint = await db.query.serverEndpoints.findFirst({ where: eq(schema.serverEndpoints.port, 25590) });
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
    console.log(`✔ community /c/${c.slug}`);
  }
}

try {
  await main();
} finally {
  await closeRedis();
  await sql.end();
}
