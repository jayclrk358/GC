import { z } from 'zod';
import {
  isValidTimeZone,
  parseLocal,
  RECURRENCE_FREQS,
  zonedToUtc,
  type Recurrence,
} from './events';

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');

export const recurrenceSchema = z.object({
  freq: z.enum(RECURRENCE_FREQS),
  interval: z.number().int().min(1).max(30).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  until: localDate.nullable().default(null),
  count: z.number().int().min(1).max(500).nullable().default(null),
}) satisfies z.ZodType<Recurrence, unknown>;

/** Longest a single event may last. */
export const MAX_EVENT_DAYS = 31;
/** How far ahead a repeating event's last date may be. */
export const MAX_SERIES_YEARS = 5;

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the event a name.').max(120),
    description: z.string().trim().max(4000).default(''),
    location: z.string().trim().max(200).default(''),
    timezone: z.string().refine(isValidTimeZone, 'Choose a time zone.'),
    /** Local "YYYY-MM-DDTHH:mm" in `timezone` (all-day events use 00:00). */
    start: z.string().refine((v) => parseLocal(v) !== null, 'Choose a start date and time.'),
    end: z.string().refine((v) => parseLocal(v) !== null, 'Choose an end date and time.'),
    allDay: z.boolean().default(false),
    /** Most people who can say they're going (0: no limit). */
    capacity: z.number().int().min(0).max(100_000).default(0),
    recurrence: recurrenceSchema.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    const start = parseLocal(v.start);
    const end = parseLocal(v.end);
    if (!start || !end || !isValidTimeZone(v.timezone)) return;
    const s = zonedToUtc(start, v.timezone).getTime();
    const e = zonedToUtc(end, v.timezone).getTime();
    if (e <= s) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'The end must be after the start.' });
    } else if (e - s > MAX_EVENT_DAYS * 86_400_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: `An event can last up to ${MAX_EVENT_DAYS} days.`,
      });
    }
    const until = v.recurrence?.until;
    if (until) {
      if (until < v.start.slice(0, 10)) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'until'],
          message: 'The last date must be after the first.',
        });
      } else if (Number(until.slice(0, 4)) - start.year > MAX_SERIES_YEARS) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'until'],
          message: `Repeat for up to ${MAX_SERIES_YEARS} years.`,
        });
      }
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;

export const RSVP_STATUSES = ['going', 'maybe', 'declined'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
