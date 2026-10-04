import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import {
  EVENT_HORIZON_MS,
  eventInputSchema,
  has,
  isOccurrence,
  newId,
  occurrencesBetween,
  occurrenceStarts,
  parseLocal,
  Permission,
  RSVP_STATUSES,
  seriesEnd,
  toIcal,
  zonedToUtc,
  type IcalEvent,
  type Recurrence,
  type RsvpStatus,
  type Schedule,
} from '@gamecentral/shared';
import { z } from 'zod';
import { requireMember, requirePerm, type MemberContext } from '../access';
import { env } from '../env';
import { AppError, conflict, forbidden, notFound } from '../errors';
import { logger } from '../logger';
import { enforceRateLimit } from '../ratelimit';
import { audit } from './audit';
import { deliver, maybeEmail, type NotificationInput } from './notify';
import { emitWebhook, siteUrl, webhookExcerpt, webhookUser } from './webhooks';

const log = logger('events');

type EventRow = typeof schema.events.$inferSelect;

const scheduleOf = (
  e: Pick<EventRow, 'startsAt' | 'endsAt' | 'timezone' | 'recurrence'>,
): Schedule => ({
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  timezone: e.timezone,
  recurrence: e.recurrence ?? null,
});

/** One date of an event, as lists and calendars show it. */
export interface EventOccurrenceView {
  eventId: string;
  /** Start of this occurrence (ISO); identifies it for RSVPs. */
  start: string;
  end: string;
  title: string;
  location: string;
  allDay: boolean;
  timezone: string;
  repeats: boolean;
  capacity: number;
  going: number;
  maybe: number;
  mine: RsvpStatus | null;
  /** The start of the description, for a preview. */
  summary: string;
  /** The first few people going (to show their faces). */
  goingPreview: EventFace[];
}

export interface EventFace {
  id: string;
  name: string;
  image: string | null;
}

/** How many faces each date shows. */
const FACES = 5;

/** The first paragraph of a description, cut to a line or two. */
export function eventSummary(description: string, max = 160): string {
  const first =
    description
      .trim()
      .split(/\n\s*\n/)[0]
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:–-]+$/, '')}…`;
}

/** "Fri, 3 Oct 2026, 20:00 BST" in the event's own zone (for notifications and emails). */
export function eventTimeLabel(at: Date, timezone: string, allDay: boolean): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
  }).format(at);
}

async function loadEvent(ctx: MemberContext, id: string): Promise<EventRow> {
  if (!z.string().uuid().safeParse(id).success) throw notFound('Event');
  const row = await db.query.events.findFirst({
    where: and(eq(schema.events.id, id), eq(schema.events.communityId, ctx.community.id)),
  });
  if (!row) throw notFound('Event');
  return row;
}

/**
 * Whether `at` is in the range of this event's dates: from its first to its last, and never past
 * the horizon. Anything else can't be one of them, and working dates out far enough ahead throws.
 */
function withinSeries(
  event: Pick<EventRow, 'startsAt' | 'seriesEndsAt'>,
  at: Date | null | undefined,
): at is Date {
  const t = at?.getTime() ?? Number.NaN;
  if (!Number.isFinite(t) || t < event.startsAt.getTime()) return false;
  const horizon = Math.max(Date.now(), event.startsAt.getTime()) + EVENT_HORIZON_MS;
  return t <= Math.min(event.seriesEndsAt?.getTime() ?? horizon, horizon);
}

async function exceptionsFor(ids: string[]): Promise<Map<string, Set<number>>> {
  const map = new Map<string, Set<number>>();
  if (!ids.length) return map;
  const rows = await db
    .select()
    .from(schema.eventExceptions)
    .where(inArray(schema.eventExceptions.eventId, ids));
  for (const r of rows) {
    const set = map.get(r.eventId) ?? new Set<number>();
    set.add(r.occurrence.getTime());
    map.set(r.eventId, set);
  }
  return map;
}

/** RSVP counts and the viewer's own answer for these occurrences. */
async function rsvpSummary(
  pairs: { eventId: string; start: Date }[],
  userId: string | null,
): Promise<Map<string, { going: number; maybe: number; mine: RsvpStatus | null }>> {
  const out = new Map<string, { going: number; maybe: number; mine: RsvpStatus | null }>();
  if (!pairs.length) return out;
  const ids = [...new Set(pairs.map((p) => p.eventId))];
  const times = pairs.map((p) => p.start.getTime());
  const from = new Date(Math.min(...times));
  const to = new Date(Math.max(...times));
  const where = and(
    inArray(schema.eventRsvps.eventId, ids),
    gte(schema.eventRsvps.occurrence, from),
    lte(schema.eventRsvps.occurrence, to),
  );
  const [counts, mine] = await Promise.all([
    db
      .select({
        eventId: schema.eventRsvps.eventId,
        occurrence: schema.eventRsvps.occurrence,
        status: schema.eventRsvps.status,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.eventRsvps)
      .where(where)
      .groupBy(schema.eventRsvps.eventId, schema.eventRsvps.occurrence, schema.eventRsvps.status),
    userId
      ? db
          .select({
            eventId: schema.eventRsvps.eventId,
            occurrence: schema.eventRsvps.occurrence,
            status: schema.eventRsvps.status,
          })
          .from(schema.eventRsvps)
          .where(and(where, eq(schema.eventRsvps.userId, userId)))
      : [],
  ]);
  const key = (id: string, at: Date) => `${id}:${at.getTime()}`;
  const get = (k: string) => {
    let v = out.get(k);
    if (!v) out.set(k, (v = { going: 0, maybe: 0, mine: null }));
    return v;
  };
  for (const c of counts) {
    const v = get(key(c.eventId, c.occurrence));
    if (c.status === 'going') v.going = c.n;
    if (c.status === 'maybe') v.maybe = c.n;
  }
  for (const m of mine) get(key(m.eventId, m.occurrence)).mine = m.status;
  return out;
}

/** The first people to say they're going to each date (in the order they said so). */
async function goingFaces(
  ctx: MemberContext,
  pairs: { eventId: string; start: Date }[],
): Promise<Map<string, EventFace[]>> {
  const out = new Map<string, EventFace[]>();
  if (!pairs.length) return out;
  const r = schema.eventRsvps;
  const times = pairs.map((p) => p.start.getTime());
  const ranked = db
    .select({
      eventId: r.eventId,
      occurrence: r.occurrence,
      id: r.userId,
      name: sql<string>`coalesce(nullif(${schema.members.nickname}, ''), ${schema.users.name})`.as(
        'name',
      ),
      image: schema.users.image,
      n: sql<number>`row_number() over (partition by ${r.eventId}, ${r.occurrence} order by ${r.createdAt})`.as(
        'n',
      ),
    })
    .from(r)
    .innerJoin(schema.users, eq(schema.users.id, r.userId))
    .leftJoin(
      schema.members,
      and(eq(schema.members.communityId, ctx.community.id), eq(schema.members.userId, r.userId)),
    )
    .where(
      and(
        inArray(r.eventId, [...new Set(pairs.map((p) => p.eventId))]),
        gte(r.occurrence, new Date(Math.min(...times))),
        lte(r.occurrence, new Date(Math.max(...times))),
        eq(r.status, 'going'),
      ),
    )
    .as('ranked');
  const rows = await db.select().from(ranked).where(lte(ranked.n, FACES));
  for (const row of rows) {
    const k = `${row.eventId}:${row.occurrence.getTime()}`;
    const list = out.get(k) ?? [];
    list.push({ id: row.id, name: row.name, image: row.image });
    out.set(k, list);
  }
  return out;
}

/** Every date of the community's events between two times, in order. */
export async function listEventOccurrences(
  ctx: MemberContext,
  range: { from: Date; to: Date; limit?: number; newestFirst?: boolean },
): Promise<EventOccurrenceView[]> {
  const limit = Math.min(range.limit ?? 200, 500);
  const rows = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.communityId, ctx.community.id),
        isNull(schema.events.cancelledAt),
        lt(schema.events.startsAt, range.to),
        or(isNull(schema.events.seriesEndsAt), gt(schema.events.seriesEndsAt, range.from)),
      ),
    )
    .orderBy(asc(schema.events.startsAt))
    .limit(500);
  const exceptions = await exceptionsFor(rows.filter((r) => r.recurrence).map((r) => r.id));
  let list: { event: EventRow; start: Date; end: Date }[] = [];
  for (const event of rows) {
    // Enough of each series to fill the page from either end.
    for (const o of occurrencesBetween(
      scheduleOf(event),
      range.from,
      range.to,
      range.newestFirst ? 500 : limit,
      exceptions.get(event.id),
    )) {
      list.push({ event, ...o });
    }
  }
  list.sort((a, b) => a.start.getTime() - b.start.getTime());
  list = range.newestFirst ? list.slice(-limit).reverse() : list.slice(0, limit);
  const pairs = list.map((o) => ({ eventId: o.event.id, start: o.start }));
  const rsvps = await rsvpSummary(pairs, ctx.isMember ? ctx.userId : null);
  // Faces only where someone's going.
  const faces = await goingFaces(
    ctx,
    pairs.filter((p) => rsvps.get(`${p.eventId}:${p.start.getTime()}`)?.going),
  );
  return list.map(({ event, start, end }) => {
    const k = `${event.id}:${start.getTime()}`;
    const r = rsvps.get(k);
    return {
      eventId: event.id,
      start: start.toISOString(),
      end: end.toISOString(),
      title: event.title,
      location: event.location,
      allDay: event.allDay,
      timezone: event.timezone,
      repeats: Boolean(event.recurrence),
      capacity: event.capacity,
      going: r?.going ?? 0,
      maybe: r?.maybe ?? 0,
      mine: r?.mine ?? null,
      summary: eventSummary(event.description),
      goingPreview: faces.get(k) ?? [],
    };
  });
}

export async function upcomingEvents(ctx: MemberContext, limit = 20) {
  const now = new Date();
  return listEventOccurrences(ctx, {
    from: now,
    to: new Date(now.getTime() + 366 * 86_400_000),
    limit,
  });
}

export async function pastEvents(ctx: MemberContext, limit = 20) {
  const now = new Date();
  return listEventOccurrences(ctx, {
    from: new Date(now.getTime() - 366 * 86_400_000),
    to: now,
    limit,
    newestFirst: true,
  });
}

export interface EventAttendee {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  status: 'going' | 'maybe';
}

/** An event, at one of its dates (the next one unless asked), with who's coming. */
export async function getEventDetail(ctx: MemberContext, id: string, at?: Date | null) {
  const event = await loadEvent(ctx, id);
  const schedule = scheduleOf(event);
  const exceptions = (await exceptionsFor([event.id])).get(event.id) ?? new Set<number>();
  const now = new Date();
  const length = event.endsAt.getTime() - event.startsAt.getTime();
  let start: Date | null = null;
  let cancelledDate = false;
  if (withinSeries(event, at) && isOccurrence(schedule, at)) {
    start = at;
    cancelledDate = exceptions.has(at.getTime());
  }
  const upcoming = occurrencesBetween(
    schedule,
    now,
    new Date(now.getTime() + 366 * 86_400_000),
    6,
    exceptions,
  );
  if (!start) {
    start =
      upcoming[0]?.start ??
      occurrencesBetween(schedule, new Date(0), now, 10_000, exceptions).at(-1)?.start ??
      event.startsAt;
  }
  const end = new Date(start.getTime() + length);
  const rsvps = await db
    .select({
      userId: schema.eventRsvps.userId,
      status: schema.eventRsvps.status,
      name: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
      nickname: schema.members.nickname,
    })
    .from(schema.eventRsvps)
    .innerJoin(schema.users, eq(schema.users.id, schema.eventRsvps.userId))
    .leftJoin(
      schema.members,
      and(
        eq(schema.members.communityId, ctx.community.id),
        eq(schema.members.userId, schema.eventRsvps.userId),
      ),
    )
    .where(and(eq(schema.eventRsvps.eventId, event.id), eq(schema.eventRsvps.occurrence, start)))
    .orderBy(asc(schema.eventRsvps.createdAt))
    .limit(500);
  const attendees: EventAttendee[] = rsvps
    .filter((r) => r.status !== 'declined')
    .map((r) => ({
      id: r.userId,
      name: r.nickname || r.name,
      username: r.username,
      image: r.image,
      status: r.status as 'going' | 'maybe',
    }));
  const mine = ctx.userId ? (rsvps.find((r) => r.userId === ctx.userId)?.status ?? null) : null;
  const going = attendees.filter((a) => a.status === 'going').length;
  const cancelled = Boolean(event.cancelledAt) || cancelledDate;
  const ended = end.getTime() <= now.getTime();
  return {
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      timezone: event.timezone,
      allDay: event.allDay,
      capacity: event.capacity,
      recurrence: event.recurrence ?? null,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      creatorId: event.creatorId,
    },
    occurrence: { start: start.toISOString(), end: end.toISOString() },
    upcoming: upcoming.map((o) => o.start.toISOString()),
    attendees,
    going,
    maybe: attendees.length - going,
    mine,
    full: event.capacity > 0 && going >= event.capacity,
    cancelled,
    /** The whole event is called off. */
    seriesCancelled: Boolean(event.cancelledAt),
    /** Just this date is. */
    dateCancelled: cancelledDate,
    ended,
    canRsvp: ctx.isMember && has(ctx.base, Permission.RSVP_EVENTS) && !cancelled && !ended,
    canManage: has(ctx.base, Permission.MANAGE_EVENTS),
  };
}

/** Form values (local times in the event's zone) → what's stored. */
function toStored(raw: unknown) {
  const input = eventInputSchema.parse(raw);
  const startsAt = zonedToUtc(parseLocal(input.start)!, input.timezone);
  const endsAt = zonedToUtc(parseLocal(input.end)!, input.timezone);
  const recurrence: Recurrence | null = input.recurrence
    ? {
        ...input.recurrence,
        weekdays: input.recurrence.freq === 'weekly' ? input.recurrence.weekdays : [],
      }
    : null;
  const schedule: Schedule = { startsAt, endsAt, timezone: input.timezone, recurrence };
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    timezone: input.timezone,
    startsAt,
    endsAt,
    allDay: input.allDay,
    capacity: input.capacity,
    recurrence,
    seriesEndsAt: seriesEnd(schedule),
    // The reminder job works out the next date afresh.
    nextOccurrenceAt: null,
  };
}

export async function createEvent(ctx: MemberContext, raw: unknown): Promise<{ id: string }> {
  requirePerm(ctx, Permission.MANAGE_EVENTS);
  await enforceRateLimit(`event-create:${ctx.userId}`, 30, 3600);
  const values = toStored(raw);
  const id = newId();
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.events)
      .values({ id, communityId: ctx.community.id, creatorId: ctx.userId, ...values });
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'event.create',
      targetType: 'event',
      targetId: id,
      diff: { title: values.title },
    });
  });
  const creatorId = ctx.userId!;
  emitWebhook(ctx.community.id, 'event.created', async () => ({
    event: {
      id,
      title: values.title,
      description: webhookExcerpt(values.description),
      location: values.location,
      startsAt: values.startsAt.toISOString(),
      endsAt: values.endsAt.toISOString(),
      timezone: values.timezone,
      allDay: values.allDay,
      recurring: Boolean(values.recurrence),
      when: eventTimeLabel(values.startsAt, values.timezone, values.allDay),
      url: siteUrl(`/c/${ctx.community.slug}/events/${id}`),
    },
    author: await webhookUser(creatorId),
  }));
  return { id };
}

/** Tell people who said they're going (or might) about a change. */
async function tellAttendees(
  ctx: MemberContext,
  event: EventRow,
  occurrences: Date[] | 'future',
  title: string,
  excerpt: string,
) {
  const where =
    occurrences === 'future'
      ? gte(schema.eventRsvps.occurrence, new Date())
      : inArray(schema.eventRsvps.occurrence, occurrences);
  const rows = await db
    .selectDistinct({ userId: schema.eventRsvps.userId })
    .from(schema.eventRsvps)
    .where(
      and(
        eq(schema.eventRsvps.eventId, event.id),
        inArray(schema.eventRsvps.status, ['going', 'maybe']),
        where,
      ),
    );
  const items: NotificationInput[] = rows
    .filter((r) => r.userId !== ctx.userId)
    .map((r) => ({
      userId: r.userId,
      type: 'event',
      communityId: ctx.community.id,
      actorId: ctx.userId,
      targetType: 'event',
      targetId: event.id,
      url: `/c/${ctx.community.slug}/events/${event.id}`,
      data: { title, excerpt, community: ctx.community.name },
    }));
  await deliver(items);
}

export async function updateEvent(ctx: MemberContext, id: string, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_EVENTS);
  const before = await loadEvent(ctx, id);
  const values = toStored(raw);
  const moved =
    before.startsAt.getTime() !== values.startsAt.getTime() ||
    before.endsAt.getTime() !== values.endsAt.getTime() ||
    before.timezone !== values.timezone ||
    JSON.stringify(before.recurrence ?? null) !== JSON.stringify(values.recurrence);
  await db.transaction(async (tx) => {
    await tx.update(schema.events).set(values).where(eq(schema.events.id, id));
    if (moved) {
      if (!before.recurrence && !values.recurrence) {
        // A one-off event that moved: everyone's answer moves with it.
        await tx
          .update(schema.eventRsvps)
          .set({ occurrence: values.startsAt })
          .where(eq(schema.eventRsvps.eventId, id));
      } else {
        // Answers for dates that no longer happen go; the rest stay.
        const schedule: Schedule = {
          startsAt: values.startsAt,
          endsAt: values.endsAt,
          timezone: values.timezone,
          recurrence: values.recurrence,
        };
        const answered = await tx
          .selectDistinct({ occurrence: schema.eventRsvps.occurrence })
          .from(schema.eventRsvps)
          .where(eq(schema.eventRsvps.eventId, id));
        const gone = answered.map((a) => a.occurrence).filter((at) => !isOccurrence(schedule, at));
        if (gone.length) {
          await tx
            .delete(schema.eventRsvps)
            .where(
              and(eq(schema.eventRsvps.eventId, id), inArray(schema.eventRsvps.occurrence, gone)),
            );
        }
      }
    }
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'event.update',
      targetType: 'event',
      targetId: id,
      diff: { title: values.title },
    });
  });
  if (moved) {
    await tellAttendees(
      ctx,
      { ...before, ...values },
      'future',
      `${values.title} has a new time`,
      eventTimeLabel(values.startsAt, values.timezone, values.allDay),
    );
  }
}

/** Call off the whole event (it stays listed for those who look it up, marked cancelled). */
export async function cancelEvent(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_EVENTS);
  const event = await loadEvent(ctx, id);
  if (event.cancelledAt) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.events).set({ cancelledAt: new Date() }).where(eq(schema.events.id, id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'event.cancel',
      targetType: 'event',
      targetId: id,
      diff: { title: event.title },
    });
  });
  await tellAttendees(ctx, event, 'future', `${event.title} was cancelled`, '');
}

/** Call off one date of a repeating event. */
export async function cancelOccurrence(ctx: MemberContext, id: string, at: Date): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_EVENTS);
  const event = await loadEvent(ctx, id);
  if (!withinSeries(event, at) || !isOccurrence(scheduleOf(event), at)) {
    throw notFound('That date');
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.eventExceptions)
      .values({ eventId: id, occurrence: at })
      .onConflictDoNothing();
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'event.cancel_date',
      targetType: 'event',
      targetId: id,
      diff: { title: event.title, date: at.toISOString() },
    });
  });
  await tellAttendees(
    ctx,
    event,
    [at],
    `${event.title} on ${eventTimeLabel(at, event.timezone, true)} was cancelled`,
    '',
  );
}

export async function deleteEvent(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_EVENTS);
  const event = await loadEvent(ctx, id);
  await db.transaction(async (tx) => {
    await tx.delete(schema.events).where(eq(schema.events.id, id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'event.delete',
      targetType: 'event',
      targetId: id,
      diff: { title: event.title },
    });
  });
}

const rsvpSchema = z.enum(RSVP_STATUSES).nullable();

/** Say you're going (or might, or can't) to one date of an event; null takes it back. */
export async function rsvpEvent(
  ctx: MemberContext,
  id: string,
  at: Date,
  rawStatus: unknown,
): Promise<{ going: number; maybe: number; mine: RsvpStatus | null }> {
  requireMember(ctx);
  if (!has(ctx.base, Permission.RSVP_EVENTS)) throw forbidden("You can't answer events here.");
  const status = rsvpSchema.parse(rawStatus);
  await enforceRateLimit(`rsvp:${ctx.userId}`, 60, 60);
  const event = await loadEvent(ctx, id);
  if (event.cancelledAt) throw new AppError('bad_request', 'This event was cancelled.');
  const schedule = scheduleOf(event);
  if (!withinSeries(event, at) || !isOccurrence(schedule, at)) throw notFound('That date');
  const exceptions = (await exceptionsFor([id])).get(id);
  if (exceptions?.has(at.getTime())) throw new AppError('bad_request', 'That date was cancelled.');
  const end = at.getTime() + (event.endsAt.getTime() - event.startsAt.getTime());
  if (end <= Date.now()) throw new AppError('bad_request', 'This event is over.');
  const userId = ctx.userId!;
  const mine = and(
    eq(schema.eventRsvps.eventId, id),
    eq(schema.eventRsvps.occurrence, at),
    eq(schema.eventRsvps.userId, userId),
  );
  await db.transaction(async (tx) => {
    if (status === null) {
      await tx.delete(schema.eventRsvps).where(mine);
      return;
    }
    if (status === 'going' && event.capacity > 0) {
      // One at a time per event, so two people can't take the last place together.
      await tx.execute(sql`select id from events where id = ${id} for update`);
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.eventRsvps)
        .where(
          and(
            eq(schema.eventRsvps.eventId, id),
            eq(schema.eventRsvps.occurrence, at),
            eq(schema.eventRsvps.status, 'going'),
            sql`${schema.eventRsvps.userId} <> ${userId}`,
          ),
        );
      if (n >= event.capacity) throw conflict('This event is full.');
    }
    await tx
      .insert(schema.eventRsvps)
      .values({ eventId: id, occurrence: at, userId, status })
      .onConflictDoUpdate({
        target: [schema.eventRsvps.eventId, schema.eventRsvps.occurrence, schema.eventRsvps.userId],
        set: { status, updatedAt: new Date() },
      });
  });
  const summary = (await rsvpSummary([{ eventId: id, start: at }], userId)).get(
    `${id}:${at.getTime()}`,
  );
  return { going: summary?.going ?? 0, maybe: summary?.maybe ?? 0, mine: status };
}

// ── Reminders ───────────────────────────────────────────────────────────────

/** How long before an event its reminder goes out. */
const REMINDER_LEAD_MS = 60 * 60 * 1000;

/** What the reminder job needs of an event (not its description and the rest). */
interface ReminderEvent {
  id: string;
  communityId: string;
  title: string;
  location: string;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  recurrence: Recurrence | null;
  seriesEndsAt: Date | null;
  updatedAt: Date;
  slug: string;
  community: string;
}

/** The first start strictly after `after`, or null once the series is over. */
function nextStartAfter(s: Schedule, after: Date): Date | null {
  for (const start of occurrenceStarts(s, after)) {
    if (start.getTime() > after.getTime()) return start;
  }
  return null;
}

/**
 * Remind those going (or maybe going) about one occurrence. The reminder is claimed before it's
 * sent, so it goes out at most once even if sending fails part way.
 */
async function remindOccurrence(event: ReminderEvent, start: Date): Promise<number> {
  const claimed = await db
    .insert(schema.eventReminders)
    .values({ eventId: event.id, occurrence: start })
    .onConflictDoNothing()
    .returning({ eventId: schema.eventReminders.eventId });
  if (!claimed.length) return 0;
  const people = await db
    .select({ userId: schema.eventRsvps.userId })
    .from(schema.eventRsvps)
    .where(
      and(
        eq(schema.eventRsvps.eventId, event.id),
        eq(schema.eventRsvps.occurrence, start),
        inArray(schema.eventRsvps.status, ['going', 'maybe']),
      ),
    );
  if (!people.length) return 0;
  const { slug, community } = event;
  const when = eventTimeLabel(start, event.timezone, event.allDay);
  const url = `/c/${slug}/events/${event.id}?at=${encodeURIComponent(start.toISOString())}`;
  const excerpt = [when, event.location].filter(Boolean).join(' · ');
  await deliver(
    people.map((p) => ({
      userId: p.userId,
      type: 'event' as const,
      communityId: event.communityId,
      actorId: null,
      targetType: 'event',
      targetId: event.id,
      url,
      data: { title: `Starting soon: ${event.title}`, excerpt, community },
    })),
  );
  for (const p of people) {
    await maybeEmail(
      p.userId,
      'event',
      `Starting soon: ${event.title}`,
      `${event.title} (${community}) starts ${when}.${event.location ? ` Where: ${event.location}.` : ''}`,
      url,
      `event:${event.id}`,
    ).catch((err: Error) => log.warn({ err: err.message }, 'event reminder email failed'));
  }
  return people.length;
}

/**
 * Remind people going (or maybe going) about occurrences starting within the hour. Runs every
 * few minutes; each occurrence's reminder is sent once. Only events whose next date is near (or
 * not worked out yet) are looked at, and each then notes its following date.
 */
export async function sendEventReminders(): Promise<number> {
  const now = new Date();
  const soon = new Date(now.getTime() + REMINDER_LEAD_MS);
  const e = schema.events;
  const rows: ReminderEvent[] = await db
    .select({
      id: e.id,
      communityId: e.communityId,
      title: e.title,
      location: e.location,
      timezone: e.timezone,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      recurrence: e.recurrence,
      seriesEndsAt: e.seriesEndsAt,
      updatedAt: e.updatedAt,
      slug: schema.communities.slug,
      community: schema.communities.name,
    })
    .from(e)
    .innerJoin(schema.communities, eq(schema.communities.id, e.communityId))
    .where(
      and(
        isNull(e.cancelledAt),
        isNull(schema.communities.deletedAt),
        isNull(schema.communities.suspendedAt),
        lte(e.startsAt, soon),
        or(isNull(e.seriesEndsAt), gt(e.seriesEndsAt, now)),
        or(isNull(e.nextOccurrenceAt), lte(e.nextOccurrenceAt, soon)),
      ),
    )
    .limit(5000);
  const exceptions = await exceptionsFor(rows.filter((r) => r.recurrence).map((r) => r.id));
  let sent = 0;
  for (const event of rows) {
    // One event going wrong (or one date of it) mustn't hold up everyone else's reminders.
    try {
      const schedule = scheduleOf(event);
      const due = occurrencesBetween(schedule, now, soon, 3, exceptions.get(event.id)).filter(
        (o) => o.start.getTime() > now.getTime(),
      );
      for (const o of due) {
        try {
          sent += await remindOccurrence(event, o.start);
        } catch (err) {
          log.error(
            { err, eventId: event.id, occurrence: o.start.toISOString() },
            'event reminder failed',
          );
        }
      }
      // Nothing more to do here until the date after this window comes near (once the series is
      // over, its end: it drops out of the search then). Not if it was edited meanwhile, which
      // clears this to be worked out again. updatedAt stays the last change a person made
      // (calendar files show it).
      await db
        .update(e)
        .set({
          nextOccurrenceAt: nextStartAfter(schedule, soon) ?? event.seriesEndsAt,
          updatedAt: event.updatedAt,
        })
        .where(
          and(
            eq(e.id, event.id),
            // Stored to the microsecond, read back to the millisecond.
            sql`date_trunc('milliseconds', ${e.updatedAt}) = ${event.updatedAt.toISOString()}::timestamptz`,
          ),
        );
    } catch (err) {
      log.error({ err, eventId: event.id }, 'event reminders failed');
    }
  }
  return sent;
}

// ── Calendar files ──────────────────────────────────────────────────────────

function toIcalEvent(e: EventRow, slug: string, exceptions: Set<number> | undefined): IcalEvent {
  const host = new URL(env().APP_URL).host;
  return {
    ...scheduleOf(e),
    uid: `${e.id}@${host}`,
    title: e.title,
    description: e.description,
    location: e.location,
    url: `${env().APP_URL}/c/${slug}/events/${e.id}`,
    allDay: e.allDay,
    cancelled: Boolean(e.cancelledAt),
    updatedAt: e.updatedAt,
    exceptions: [...(exceptions ?? [])].map((t) => new Date(t)),
  };
}

/** The community's events (recent and to come) as a calendar to subscribe to. */
export async function communityIcal(ctx: MemberContext): Promise<string> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.communityId, ctx.community.id),
        or(isNull(schema.events.seriesEndsAt), gt(schema.events.seriesEndsAt, since)),
      ),
    )
    .orderBy(asc(schema.events.startsAt))
    .limit(1000);
  const exceptions = await exceptionsFor(rows.filter((r) => r.recurrence).map((r) => r.id));
  return toIcal(
    rows.map((r) => toIcalEvent(r, ctx.community.slug, exceptions.get(r.id))),
    `${ctx.community.name} events`,
  );
}

/** One event as a calendar file (to add to your own calendar). */
export async function eventIcal(
  ctx: MemberContext,
  id: string,
): Promise<{ title: string; ics: string }> {
  const event = await loadEvent(ctx, id);
  const exceptions = (await exceptionsFor([id])).get(id);
  return {
    title: event.title,
    ics: toIcal([toIcalEvent(event, ctx.community.slug, exceptions)], event.title),
  };
}

/**
 * Calendar apps can't sign in, so a private community's feed address carries a key made from
 * the member's id. It stops working if they leave (membership is checked on every fetch).
 */
export function calendarFeedKey(communityId: string, userId: string): string {
  return createHmac('sha256', env().BETTER_AUTH_SECRET)
    .update(`ics:${communityId}:${userId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function checkCalendarFeedKey(communityId: string, userId: string, key: string): boolean {
  const want = Buffer.from(calendarFeedKey(communityId, userId));
  const got = Buffer.from(key);
  return want.length === got.length && timingSafeEqual(want, got);
}
