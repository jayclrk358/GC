import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  fillSeries,
  HISTORY_BUCKETS,
  summariseHistory,
  type HistoryPoint,
  type HistoryRange,
} from '@magnox/shared';
import { cached } from '../cache';
import { logger } from '../logger';
import { cacheRedis } from '../redis';

const log = logger('history');

const HOUR = 3600_000;
/** Raw SQL parameters must be strings; the driver doesn't serialise Date objects there. */
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const DAY = 24 * HOUR;
/** Raw samples are kept this many whole days (plus today). */
export const SAMPLE_RETENTION_DAYS = 8;
/** Hourly rollups are kept a year; daily ones forever. */
export const HOURLY_RETENTION_DAYS = 366;

// ── Samples ────────────────────────────────────────────────────────────────

function partitionName(day: Date): string {
  return `server_samples_${day.toISOString().slice(0, 10).replaceAll('-', '')}`;
}

function utcDay(t: number): Date {
  return new Date(Math.floor(t / DAY) * DAY);
}

/** Create the daily partitions from `behind` days ago to `ahead` days from now. Idempotent. */
export async function ensureSamplePartitions(
  ahead = 3,
  now = Date.now(),
  behind = 1,
): Promise<void> {
  for (let i = -behind; i <= ahead; i++) {
    const from = utcDay(now + i * DAY);
    const to = new Date(from.getTime() + DAY);
    // Identifiers and bounds are generated from dates, never from input.
    await db.execute(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS "${partitionName(from)}" PARTITION OF server_samples ` +
          `FOR VALUES FROM ('${from.toISOString()}') TO ('${to.toISOString()}')`,
      ),
    );
  }
}

/** Drop whole-day partitions older than the retention window. Returns the dropped names. */
export async function dropOldSamplePartitions(now = Date.now()): Promise<string[]> {
  const cutoff = partitionName(utcDay(now - SAMPLE_RETENTION_DAYS * DAY));
  const rows = await db.execute<{ name: string }>(sql`
    select c.relname as name
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'server_samples'`);
  const old = [...rows]
    .map((r) => r.name)
    .filter((n) => /^server_samples_\d{8}$/.test(n) && n < cutoff);
  for (const name of old) await db.execute(sql.raw(`DROP TABLE IF EXISTS "${name}"`));
  if (old.length) log.info({ dropped: old }, 'dropped old sample partitions');
  return old;
}

export interface SampleInput {
  endpointId: string;
  ts: Date;
  online: boolean;
  players: number | null;
  pingMs: number | null;
}

/** Record one poll result. Creates today's partition on the fly if the worker fell behind. */
export async function recordSample(s: SampleInput): Promise<void> {
  const insert = () =>
    db
      .insert(schema.serverSamples)
      .values({ ...s, players: s.online ? s.players : null })
      .onConflictDoNothing();
  try {
    await insert();
  } catch (e) {
    // 23514: no partition of relation "server_samples" found for row. Drizzle wraps the driver
    // error, so the code is on `cause`.
    const err = e as { code?: string; cause?: { code?: string } };
    if ((err.cause?.code ?? err.code) !== '23514') throw e;
    await ensureSamplePartitions(1, s.ts.getTime());
    await insert();
  }
}

// ── Rollups ────────────────────────────────────────────────────────────────

/** Summarise raw samples into hourly rows for [from, to). Re-running replaces the rows. */
export async function rollupHours(from: Date, to: Date): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    with agg as (
      select endpoint_id,
             date_trunc('hour', ts) as hour,
             count(*)::int as samples,
             count(*) filter (where online)::int as online_samples,
             avg(players) filter (where online)::real as avg_players,
             max(players) filter (where online)::int as peak_players
      from server_samples
      where ts >= ${at(from)} and ts < ${at(to)}
      group by 1, 2
    ), up as (
      insert into server_rollups_hourly
        (endpoint_id, hour, samples, online_samples, avg_players, peak_players)
      select a.* from agg a
      where exists (select 1 from server_endpoints e where e.id = a.endpoint_id)
      on conflict (endpoint_id, hour) do update set
        samples = excluded.samples,
        online_samples = excluded.online_samples,
        avg_players = excluded.avg_players,
        peak_players = excluded.peak_players
      returning 1
    )
    select count(*)::int as n from up`);
  return Number([...rows][0]?.n ?? 0);
}

/**
 * Housekeeping for server history (hourly), safe to run as often as you like: keeps partitions
 * ahead, refreshes the rollups for the previous and current hour, and once a day applies
 * retention.
 */
export async function maintainHistory(now = Date.now()): Promise<{
  hours: number;
  dropped: number;
}> {
  await ensureSamplePartitions(3, now);
  const hourStart = Math.floor(now / HOUR) * HOUR;
  const hours = await rollupHours(new Date(hourStart - HOUR), new Date(hourStart + HOUR));
  let dropped: string[] = [];
  // Retention only needs one pass a day (the first run of each UTC day).
  const day = utcDay(now).toISOString().slice(0, 10);
  const first = await cacheRedis()
    .set(`history-retention:${day}`, '1', 'EX', 2 * 24 * 3600, 'NX')
    .catch(() => 'OK');
  if (first === 'OK') {
    dropped = await dropOldSamplePartitions(now);
    await db.execute(
      sql`delete from server_rollups_hourly where hour < ${at(new Date(now - HOURLY_RETENTION_DAYS * DAY))}`,
    );
  }
  return { hours, dropped: dropped.length };
}

/** Rebuild rollups from all raw samples still kept (worker start-up, after downtime). */
export async function backfillHistory(now = Date.now()): Promise<void> {
  await ensureSamplePartitions(3, now);
  const from = new Date(utcDay(now - SAMPLE_RETENTION_DAYS * DAY).getTime());
  const to = new Date(Math.floor(now / HOUR) * HOUR + HOUR);
  await rollupHours(from, to);
}

// ── Reading history ────────────────────────────────────────────────────────

export interface ServerHistory {
  range: HistoryRange;
  bucketMinutes: number;
  from: string;
  to: string;
  points: HistoryPoint[];
  summary: { uptime: number | null; avgPlayers: number | null; peakPlayers: number | null };
}

interface BucketRow extends Record<string, unknown> {
  bucket: Date | string;
  samples: number;
  online: number;
  avgPlayers: number | null;
  peak: number | null;
}

/**
 * Player and uptime history for a chart. 24 hours and 7 days come from raw samples (kept for a
 * week); 30 days come from the hourly rollups. Kept for a minute per endpoint and range, since
 * everyone looking at a server asks for the same few series; passing `now` reads it fresh.
 */
export async function endpointHistory(
  endpointId: string,
  range: HistoryRange,
  now?: number,
): Promise<ServerHistory> {
  if (now !== undefined) return readEndpointHistory(endpointId, range, now);
  return cached(`history:${endpointId}:${range}`, 60, () =>
    readEndpointHistory(endpointId, range, Date.now()),
  );
}

async function readEndpointHistory(
  endpointId: string,
  range: HistoryRange,
  now: number,
): Promise<ServerHistory> {
  const { hours, bucketMinutes } = HISTORY_BUCKETS[range];
  const bucketMs = bucketMinutes * 60_000;
  const bucketSec = bucketMs / 1000;
  // Whole buckets only, ending with the one in progress.
  const to = new Date(Math.floor(now / bucketMs) * bucketMs + bucketMs);
  const from = new Date(to.getTime() - hours * HOUR);

  const rows =
    range === '30d'
      ? await db.execute<BucketRow>(sql`
          select to_timestamp(floor(extract(epoch from hour) / ${bucketSec}) * ${bucketSec}) as bucket,
                 sum(samples)::int as samples,
                 sum(online_samples)::int as online,
                 (sum(avg_players * online_samples) filter (where avg_players is not null)
                   / nullif(sum(online_samples) filter (where avg_players is not null), 0))::float8
                   as "avgPlayers",
                 max(peak_players)::int as peak
          from server_rollups_hourly
          where endpoint_id = ${endpointId} and hour >= ${at(from)} and hour < ${at(to)}
          group by 1 order by 1`)
      : await db.execute<BucketRow>(sql`
          select to_timestamp(floor(extract(epoch from ts) / ${bucketSec}) * ${bucketSec}) as bucket,
                 count(*)::int as samples,
                 count(*) filter (where online)::int as online,
                 (avg(players) filter (where online))::float8 as "avgPlayers",
                 max(players) filter (where online)::int as peak
          from server_samples
          where endpoint_id = ${endpointId} and ts >= ${at(from)} and ts < ${at(to)}
          group by 1 order by 1`);

  const list = [...rows].map((r) => ({
    bucket: r.bucket,
    samples: Number(r.samples),
    online: Number(r.online),
    avgPlayers: r.avgPlayers === null ? null : Number(r.avgPlayers),
    peak: r.peak === null ? null : Number(r.peak),
  }));
  const points = fillSeries(list, from, to, bucketMs);
  const totals = list.reduce(
    (acc, r) => ({ samples: acc.samples + r.samples, online: acc.online + r.online }),
    { samples: 0, online: 0 },
  );
  return {
    range,
    bucketMinutes,
    from: from.toISOString(),
    to: to.toISOString(),
    points,
    summary: summariseHistory(points, totals),
  };
}

/** History for a listing, if it exists. */
export async function serverHistory(serverId: string, range: HistoryRange) {
  const row = await db
    .select({ endpointId: schema.gameServers.endpointId })
    .from(schema.gameServers)
    .where(and(eq(schema.gameServers.id, serverId), isNull(schema.gameServers.deletedAt)))
    .limit(1);
  if (!row[0]) return null;
  return endpointHistory(row[0].endpointId, range);
}

/** Votes in the last 30 days, for ranking and the detail page. */
export async function recentVoteCount(serverId: string, now = Date.now()): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.serverVotes)
    .where(
      and(
        eq(schema.serverVotes.serverId, serverId),
        gte(schema.serverVotes.createdAt, new Date(now - 30 * DAY)),
      ),
    );
  return r?.n ?? 0;
}
