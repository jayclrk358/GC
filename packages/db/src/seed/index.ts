import { db, schema, sql } from '../index';
import { GAMES } from './games';

async function main() {
  for (const g of GAMES) {
    await db
      .insert(schema.games)
      .values({
        id: g.id,
        name: g.name,
        protocol: g.protocol ?? null,
        steamAppId: g.steamAppId ?? null,
        color: g.color ?? null,
        aliases: g.aliases ?? [],
      })
      .onConflictDoUpdate({
        target: schema.games.id,
        set: {
          name: g.name,
          protocol: g.protocol ?? null,
          steamAppId: g.steamAppId ?? null,
          color: g.color ?? null,
          aliases: g.aliases ?? [],
        },
      });
  }
  console.log(`✔ seeded ${GAMES.length} games`);

  await sql.end();
}

await main();
