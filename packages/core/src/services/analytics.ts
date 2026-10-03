import { sql } from 'drizzle-orm';
import { db } from '@gamecentral/db';
import { Permission, uuidAtTime } from '@gamecentral/shared';
import { requirePerm, type MemberContext } from '../access';
import { cached } from '../cache';

// The owner dashboard: how a community is growing and where it's busy, over the last 30 days.

export const ANALYTICS_DAYS = 30;

export interface CommunityAnalytics {
  /** Each day (UTC), oldest first, as YYYY-MM-DD. */
  days: string[];
  joins: number[];
  messages: number[];
  posts: number[];
  totals: {
    members: number;
    joined7: number;
    joined30: number;
    messages30: number;
    posts30: number;
    threads30: number;
    /** People who wrote something (chat or forum). */
    active7: number;
    active30: number;
  };
  topChannels: { id: string; name: string; type: string; count: number }[];
  topMembers: { id: string; name: string; username: string | null; count: number }[];
  generatedAt: string;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

async function load(communityId: string): Promise<CommunityAnalytics> {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (ANALYTICS_DAYS - 1)),
  );
  const week = new Date(now.getTime() - 7 * 86_400_000);
  // Ids are time-ordered (UUIDv7), so "since" is an id range on the community indexes.
  const fromId = uuidAtTime(start);
  const weekId = uuidAtTime(week);

  const [daily, totals, active, channels, people] = await Promise.all([
    db.execute<Row>(sql`
      with days as (
        select generate_series(${start.toISOString()}::timestamptz, now(), interval '1 day')::date as d
      ),
      j as (
        select (joined_at at time zone 'UTC')::date as d, count(*) as n from members
        where community_id = ${communityId} and joined_at >= ${start.toISOString()}::timestamptz
        group by 1
      ),
      m as (
        select (created_at at time zone 'UTC')::date as d, count(*) as n from messages
        where community_id = ${communityId} and id >= ${fromId}::uuid and author_id is not null
          and deleted_at is null
        group by 1
      ),
      p as (
        select (created_at at time zone 'UTC')::date as d, count(*) as n from posts
        where community_id = ${communityId} and id >= ${fromId}::uuid and deleted_at is null
        group by 1
      )
      select to_char(days.d, 'YYYY-MM-DD') as day,
        coalesce(j.n, 0) as joins, coalesce(m.n, 0) as messages, coalesce(p.n, 0) as posts
      from days
      left join j on j.d = days.d
      left join m on m.d = days.d
      left join p on p.d = days.d
      order by days.d
    `),
    db.execute<Row>(sql`
      select
        (select member_count from communities where id = ${communityId}) as members,
        (select count(*) from members where community_id = ${communityId}
          and joined_at >= ${week.toISOString()}::timestamptz) as joined7,
        (select count(*) from members where community_id = ${communityId}
          and joined_at >= ${start.toISOString()}::timestamptz) as joined30,
        (select count(*) from threads where community_id = ${communityId}
          and created_at >= ${start.toISOString()}::timestamptz and deleted_at is null) as threads30
    `),
    db.execute<Row>(sql`
      select
        count(distinct a) filter (where id >= ${weekId}::uuid) as active7,
        count(distinct a) as active30
      from (
        select author_id as a, id from messages
        where community_id = ${communityId} and id >= ${fromId}::uuid and author_id is not null
        union all
        select author_id, id from posts
        where community_id = ${communityId} and id >= ${fromId}::uuid and author_id is not null
      ) x
    `),
    db.execute<Row>(sql`
      select c.id, c.name, c.type, x.n as count from (
        select channel_id as cid, count(*) as n from messages
        where community_id = ${communityId} and id >= ${fromId}::uuid and author_id is not null
          and deleted_at is null
        group by 1
        union all
        select t.channel_id, count(*) from posts p join threads t on t.id = p.thread_id
        where p.community_id = ${communityId} and p.id >= ${fromId}::uuid and p.deleted_at is null
        group by 1
      ) x join channels c on c.id = x.cid
      order by x.n desc limit 5
    `),
    db.execute<Row>(sql`
      select u.id, u.name, u.username, x.n as count from (
        select a, count(*) as n from (
          select author_id as a from messages
          where community_id = ${communityId} and id >= ${fromId}::uuid and deleted_at is null
          union all
          select author_id from posts
          where community_id = ${communityId} and id >= ${fromId}::uuid and deleted_at is null
        ) y where a is not null group by a
      ) x join users u on u.id = x.a
      order by x.n desc limit 5
    `),
  ]);

  const t = totals[0] ?? {};
  const a = active[0] ?? {};
  const series = daily as Row[];
  return {
    days: series.map((r) => String(r.day)),
    joins: series.map((r) => num(r.joins)),
    messages: series.map((r) => num(r.messages)),
    posts: series.map((r) => num(r.posts)),
    totals: {
      members: num(t.members),
      joined7: num(t.joined7),
      joined30: num(t.joined30),
      messages30: series.reduce((s, r) => s + num(r.messages), 0),
      posts30: series.reduce((s, r) => s + num(r.posts), 0),
      threads30: num(t.threads30),
      active7: num(a.active7),
      active30: num(a.active30),
    },
    topChannels: (channels as Row[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      type: String(r.type),
      count: num(r.count),
    })),
    topMembers: (people as Row[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      username: (r.username as string | null) ?? null,
      count: num(r.count),
    })),
    generatedAt: now.toISOString(),
  };
}

/** The dashboard's numbers, worked out at most every ten minutes. */
export async function communityAnalytics(ctx: MemberContext): Promise<CommunityAnalytics> {
  requirePerm(ctx, Permission.VIEW_ANALYTICS);
  return cached(`analytics:${ctx.community.id}`, 600, () => load(ctx.community.id));
}
