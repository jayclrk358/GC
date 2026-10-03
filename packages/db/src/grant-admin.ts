// Make an account a Game Central platform admin (or take that away with --revoke):
//   pnpm --filter @gamecentral/db admin:grant you@example.com
//   pnpm --filter @gamecentral/db admin:grant you@example.com --revoke
import postgres from 'postgres';
import { loadRootEnv } from './env';

loadRootEnv();

const args = process.argv.slice(2);
const revoke = args.includes('--revoke');
const who = args
  .find((a) => !a.startsWith('--'))
  ?.trim()
  .toLowerCase();
if (!who) {
  console.error('Usage: admin:grant <email or username> [--revoke]');
  process.exit(1);
}

const url =
  process.env.DATABASE_URL ?? 'postgres://gamecentral:gamecentral@localhost:5432/gamecentral';
const sql = postgres(url, { max: 1, prepare: process.env.DATABASE_PREPARE !== 'false' });
const rows = await sql<{ email: string }[]>`
  update users set role = ${revoke ? 'user' : 'admin'}
  where lower(email) = ${who} or lower(username) = ${who}
  returning email`;
await sql.end();
if (!rows.length) {
  console.error(`No account with the email or username "${who}".`);
  process.exit(1);
}
console.log(
  revoke
    ? `✔ ${rows[0]!.email} is no longer an admin`
    : `✔ ${rows[0]!.email} is now a Game Central admin`,
);
