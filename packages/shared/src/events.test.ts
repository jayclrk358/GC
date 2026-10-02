import { describe, expect, it } from 'vitest';
import {
  isOccurrence,
  occurrencesBetween,
  parseLocal,
  seriesEnd,
  toIcal,
  utcToZoned,
  zonedToUtc,
  type Recurrence,
  type Schedule,
} from './events';
import { eventInputSchema } from './events-schema';

const local = (s: string) => parseLocal(s)!;
const rule = (r: Partial<Recurrence> & Pick<Recurrence, 'freq'>): Recurrence => ({
  interval: 1,
  weekdays: [],
  until: null,
  count: null,
  ...r,
});

function schedule(start: string, minutes: number, tz: string, r: Recurrence | null): Schedule {
  const startsAt = zonedToUtc(local(start), tz);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    timezone: tz,
    recurrence: r,
  };
}

const localStr = (d: Date, tz: string) => {
  const l = utcToZoned(d, tz);
  return `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')} ${String(l.hour).padStart(2, '0')}:${String(l.minute).padStart(2, '0')}`;
};

describe('zonedToUtc', () => {
  it('converts wall time in a zone to an instant', () => {
    expect(zonedToUtc(local('2026-07-01T20:00'), 'Europe/London').toISOString()).toBe(
      '2026-07-01T19:00:00.000Z',
    );
    expect(zonedToUtc(local('2026-01-15T20:00'), 'Europe/London').toISOString()).toBe(
      '2026-01-15T20:00:00.000Z',
    );
    expect(zonedToUtc(local('2026-03-10T09:30'), 'America/New_York').toISOString()).toBe(
      '2026-03-10T13:30:00.000Z',
    );
    expect(zonedToUtc(local('2026-06-01T00:00'), 'Asia/Kolkata').toISOString()).toBe(
      '2026-05-31T18:30:00.000Z',
    );
  });

  it('round-trips through utcToZoned', () => {
    for (const tz of ['UTC', 'Europe/Berlin', 'Australia/Sydney', 'America/Los_Angeles']) {
      const d = zonedToUtc(local('2026-11-01T01:30'), tz);
      expect(localStr(d, tz)).toBe('2026-11-01 01:30');
    }
  });

  it('moves a time skipped by the clocks going forward an hour later', () => {
    // 29 March 2026: London jumps from 01:00 to 02:00.
    expect(localStr(zonedToUtc(local('2026-03-29T01:30'), 'Europe/London'), 'Europe/London')).toBe(
      '2026-03-29 02:30',
    );
  });
});

describe('occurrences', () => {
  it('keeps the local time across a daylight-saving change', () => {
    const s = schedule('2026-03-20T20:00', 120, 'Europe/London', rule({ freq: 'weekly' }));
    const list = occurrencesBetween(s, new Date('2026-03-01Z'), new Date('2026-04-10Z'));
    expect(list.map((o) => localStr(o.start, 'Europe/London'))).toEqual([
      '2026-03-20 20:00',
      '2026-03-27 20:00',
      '2026-04-03 20:00',
    ]);
    // The UTC hour changes when the clocks do.
    expect(list[0]!.start.toISOString()).toBe('2026-03-20T20:00:00.000Z');
    expect(list[2]!.start.toISOString()).toBe('2026-04-03T19:00:00.000Z');
  });

  it('repeats on chosen weekdays, every other week', () => {
    // Wednesday 7 Oct 2026; Mondays and Wednesdays, fortnightly, 5 times.
    const s = schedule(
      '2026-10-07T18:00',
      60,
      'UTC',
      rule({ freq: 'weekly', interval: 2, weekdays: [1, 3], count: 5 }),
    );
    const list = occurrencesBetween(s, new Date('2026-01-01Z'), new Date('2027-12-31Z'));
    expect(list.map((o) => localStr(o.start, 'UTC'))).toEqual([
      '2026-10-07 18:00',
      '2026-10-19 18:00',
      '2026-10-21 18:00',
      '2026-11-02 18:00',
      '2026-11-04 18:00',
    ]);
    expect(seriesEnd(s)?.toISOString()).toBe('2026-11-04T19:00:00.000Z');
  });

  it('skips months without the day', () => {
    const s = schedule(
      '2026-01-31T12:00',
      30,
      'UTC',
      rule({ freq: 'monthly', until: '2026-06-30' }),
    );
    const list = occurrencesBetween(s, new Date('2026-01-01Z'), new Date('2027-01-01Z'));
    expect(list.map((o) => localStr(o.start, 'UTC').slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
  });

  it('finds occurrences far into an open-ended daily series quickly', () => {
    const s = schedule('2020-01-01T09:00', 30, 'UTC', rule({ freq: 'daily', interval: 3 }));
    const list = occurrencesBetween(s, new Date('2030-06-01Z'), new Date('2030-06-10Z'));
    expect(list.length).toBe(3);
    expect(seriesEnd(s)).toBeNull();
    expect(isOccurrence(s, list[1]!.start)).toBe(true);
    expect(isOccurrence(s, new Date(list[1]!.start.getTime() + 60_000))).toBe(false);
  });

  it('includes an occurrence already under way, and leaves out cancelled ones', () => {
    const s = schedule('2026-05-01T10:00', 180, 'UTC', rule({ freq: 'daily' }));
    const now = new Date('2026-05-02T11:00Z');
    const [first] = occurrencesBetween(s, now, new Date('2026-05-04Z'));
    expect(first!.start.toISOString()).toBe('2026-05-02T10:00:00.000Z');
    const skipped = occurrencesBetween(
      s,
      now,
      new Date('2026-05-04Z'),
      10,
      new Set([first!.start.getTime()]),
    );
    expect(skipped[0]!.start.toISOString()).toBe('2026-05-03T10:00:00.000Z');
  });
});

describe('eventInputSchema', () => {
  const base = {
    title: 'Raid night',
    timezone: 'Europe/London',
    start: '2026-10-03T20:00',
    end: '2026-10-03T22:00',
  };

  it('accepts a normal event', () => {
    expect(eventInputSchema.parse(base).capacity).toBe(0);
  });

  it('rejects an end before the start, unknown zones and endless runs', () => {
    expect(eventInputSchema.safeParse({ ...base, end: '2026-10-03T19:00' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({
        ...base,
        recurrence: { freq: 'daily', until: '2040-01-01' },
      }).success,
    ).toBe(false);
  });

  it('only takes a last date that exists', () => {
    const until = (d: string) =>
      eventInputSchema.safeParse({ ...base, recurrence: { freq: 'weekly', until: d } }).success;
    expect(until('2026-12-31')).toBe(true);
    expect(until('2026-13-45')).toBe(false);
    expect(until('2027-02-29')).toBe(false);
    expect(until('2028-02-29')).toBe(true);
  });
});

describe('toIcal', () => {
  it('writes a repeating event in its own time zone with cancelled dates', () => {
    const s = schedule('2026-10-02T20:00', 120, 'Europe/London', rule({ freq: 'weekly' }));
    const ics = toIcal(
      [
        {
          ...s,
          uid: 'e1@magnox',
          title: 'Raid, night; part 1',
          description: 'Bring\nsnacks',
          location: '',
          url: 'https://magnox.example/c/x/events/e1',
          allDay: false,
          cancelled: false,
          updatedAt: new Date('2026-09-01Z'),
          exceptions: [zonedToUtc(local('2026-10-09T20:00'), 'Europe/London')],
        },
      ],
      'Test',
    );
    expect(ics).toContain('DTSTART;TZID=Europe/London:20261002T200000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).toContain('EXDATE;TZID=Europe/London:20261009T200000');
    expect(ics).toContain('SUMMARY:Raid\\, night\\; part 1');
    expect(ics).toContain('DESCRIPTION:Bring\\nsnacks');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('escapes every kind of line break, so text can’t start a line of its own', () => {
    const s = schedule('2026-10-02T20:00', 60, 'UTC', null);
    const ics = toIcal(
      [
        {
          ...s,
          uid: 'e2@magnox',
          title: 'A\rSTATUS:CANCELLED',
          description: 'one\r\ntwo\nthree\rfour',
          location: '',
          url: 'https://magnox.example/c/x/events/e2',
          allDay: false,
          cancelled: false,
          updatedAt: new Date('2026-09-01Z'),
          exceptions: [],
        },
      ],
      'Test',
    );
    expect(ics).toContain('SUMMARY:A\\nSTATUS:CANCELLED');
    expect(ics).toContain('DESCRIPTION:one\\ntwo\\nthree\\nfour');
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
});

describe('zonedToUtc around the clocks going back', () => {
  it('takes the first of a time that happens twice', () => {
    // 25 October 2026: London goes from 02:00 BST back to 01:00 GMT, so 01:30 happens twice.
    expect(zonedToUtc(local('2026-10-25T01:30'), 'Europe/London').toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });
});
