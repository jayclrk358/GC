import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Recurrence } from '@magnox/shared';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tz, updatedAt } from './_helpers';

/**
 * A community event, once or repeating. Times are instants; `timezone` is the zone the organiser
 * set it in, so repeats keep their local time across daylight-saving changes.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    location: text('location').notNull().default(''),
    timezone: text('timezone').notNull(),
    /** The first occurrence. */
    startsAt: tz('starts_at').notNull(),
    endsAt: tz('ends_at').notNull(),
    allDay: boolean('all_day').notNull().default(false),
    recurrence: jsonb('recurrence').$type<Recurrence>(),
    /** When the last occurrence ends (null: repeats forever), to find what's still to come. */
    seriesEndsAt: tz('series_ends_at'),
    /** Most people going to one occurrence (0: no limit). */
    capacity: integer('capacity').notNull().default(0),
    cancelledAt: tz('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('events_community_idx').on(t.communityId, t.startsAt),
    index('events_series_end_idx').on(t.seriesEndsAt),
  ],
);

/** Who's going to which occurrence (identified by its start time). */
export const eventRsvps = pgTable(
  'event_rsvps',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    occurrence: tz('occurrence').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['going', 'maybe', 'declined'] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.occurrence, t.userId] }),
    index('event_rsvps_user_idx').on(t.userId),
  ],
);

/** A single date of a repeating event that was called off. */
export const eventExceptions = pgTable(
  'event_exceptions',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    occurrence: tz('occurrence').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.occurrence] })],
);

/** Reminders already sent, so each occurrence's goes out once. */
export const eventReminders = pgTable(
  'event_reminders',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    occurrence: tz('occurrence').notNull(),
    sentAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.occurrence] })],
);
