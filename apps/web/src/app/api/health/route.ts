import { sql } from '@gamecentral/db';
import { cacheRedis } from '@gamecentral/core';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};
  await Promise.all([
    sql`select 1`.then(
      () => (checks.db = 'ok'),
      () => (checks.db = 'error'),
    ),
    cacheRedis()
      .ping()
      .then(
        () => (checks.redis = 'ok'),
        () => (checks.redis = 'error'),
      ),
  ]);
  const ok = Object.values(checks).every((v) => v === 'ok');
  return Response.json({ status: ok ? 'ok' : 'degraded', checks }, { status: ok ? 200 : 503 });
}
