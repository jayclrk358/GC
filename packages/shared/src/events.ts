// Events: wall-clock times in the event's own time zone, repeating schedules, and iCal output.
// Times are stored as instants (UTC); a repeating event keeps its local start time across
// daylight-saving changes, as people expect ("every Friday at 8pm" stays 8pm).

/** A date and time on the clock in some time zone (months 1-12). */
export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

/** The clock reading in `tz` at an instant. */
export function utcToZoned(date: Date, tz: string): LocalDateTime & { second: number } {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Minutes `tz` is ahead of UTC at an instant. */
function offsetMinutes(date: Date, tz: string): number {
  const z = utcToZoned(date, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant a clock in `tz` reads `local`. A time skipped by a daylight-saving jump lands an
 * hour later; a repeated one resolves to the first.
 */
export function zonedToUtc(local: LocalDateTime, tz: string): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  // The zone's offsets either side of any clock change near this time.
  const before = offsetMinutes(new Date(guess - 86_400_000), tz);
  const after = offsetMinutes(new Date(guess + 86_400_000), tz);
  const fits = [before, after]
    .map((o) => guess - o * 60_000)
    .filter((utc) => offsetMinutes(new Date(utc), tz) === (guess - utc) / 60_000);
  // A time that happens twice (clocks going back) takes the earlier; one that never happens
  // (clocks going forward) is read with the offset from before the change, so it moves later.
  return new Date(fits.length ? Math.min(...fits) : guess - before * 60_000);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-03T20:00" → parts, or null. */
export function parseLocal(value: string): LocalDateTime | null {
  const m = LOCAL_RE.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Parts → "2026-10-03T20:00". */
export function formatLocal(l: LocalDateTime): string {
  return `${pad(l.year, 4)}-${pad(l.month)}-${pad(l.day)}T${pad(l.hour)}:${pad(l.minute)}`;
}

/** "2026-10-03" for a local date. */
export function localDateKey(l: Pick<LocalDateTime, 'year' | 'month' | 'day'>): string {
  return `${pad(l.year, 4)}-${pad(l.month)}-${pad(l.day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Calendar arithmetic on a local date (no time zones involved). */
function addDays(l: LocalDateTime, days: number): LocalDateTime {
  const d = new Date(Date.UTC(l.year, l.month - 1, l.day + days));
  return { ...l, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(l: Pick<LocalDateTime, 'year' | 'month' | 'day'>): number {
  return new Date(Date.UTC(l.year, l.month - 1, l.day)).getUTCDay();
}

function dayNumber(l: Pick<LocalDateTime, 'year' | 'month' | 'day'>): number {
  return Math.floor(Date.UTC(l.year, l.month - 1, l.day) / 86_400_000);
}

// ── Repeating events ────────────────────────────────────────────────────────

export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

export interface Recurrence {
  freq: RecurrenceFreq;
  /** Every N days, weeks or months. */
  interval: number;
  /** Weekly: which days (0 = Sunday). Empty means the start's weekday. */
  weekdays: number[];
  /** Last date (inclusive, local "YYYY-MM-DD"), if any. */
  until: string | null;
  /** How many times in all, if limited. */
  count: number | null;
}

/** The shape of a repeating event that the schedule needs. */
export interface Schedule {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  recurrence: Recurrence | null;
}

/**
 * How far ahead an event's dates are ever looked for: past any real plan, and well short of where
 * JavaScript dates run out (a date near that limit makes time zone conversion throw).
 */
export const EVENT_HORIZON_MS = 10 * 366 * 86_400_000;

/** Hard stop for runaway schedules (a daily event for 25 years). */
const MAX_STEPS = 10_000;

/**
 * Start times of every occurrence, in order, from the first. Infinite for open-ended schedules;
 * callers stop when they've seen enough.
 */
export function* occurrenceStarts(s: Schedule, fromHint?: Date): Generator<Date> {
  const start = utcToZoned(s.startsAt, s.timezone);
  const rule = s.recurrence;
  if (!rule) {
    yield s.startsAt;
    return;
  }
  const until = rule.until ? parseLocal(`${rule.until}T23:59`) : null;
  const untilDay = until ? dayNumber(until) : Infinity;
  const interval = Math.max(1, rule.interval);
  let produced = 0;
  let steps = 0;

  const emit = function* (l: LocalDateTime): Generator<Date, boolean> {
    if (dayNumber(l) > untilDay) return false;
    if (rule.count !== null && produced >= rule.count) return false;
    produced++;
    yield zonedToUtc(l, s.timezone);
    return true;
  };

  // Skip ahead to near `fromHint` when nothing needs counting (the common, open-ended case).
  let skip = 0;
  if (fromHint && rule.count === null && rule.freq !== 'monthly') {
    const fromLocal = utcToZoned(fromHint, s.timezone);
    const days = dayNumber(fromLocal) - dayNumber(start) - 7;
    if (days > 0) {
      skip = rule.freq === 'daily' ? Math.floor(days / interval) : Math.floor(days / 7 / interval);
    }
  }

  if (rule.freq === 'daily') {
    for (let k = skip; steps++ < MAX_STEPS; k++) {
      if (!(yield* emit(addDays(start, k * interval)))) return;
    }
  } else if (rule.freq === 'weekly') {
    const days = (rule.weekdays.length ? [...new Set(rule.weekdays)] : [weekdayOf(start)]).sort(
      // Monday-first weeks, so "Mon, Wed, Sun" happen in that order.
      (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
    );
    const monday = addDays(start, -((weekdayOf(start) + 6) % 7));
    const startDay = dayNumber(start);
    for (let k = skip; steps < MAX_STEPS; k++) {
      const weekStart = addDays(monday, k * 7 * interval);
      for (const wd of days) {
        steps++;
        const l = addDays(weekStart, (wd + 6) % 7);
        if (dayNumber(l) < startDay) continue;
        if (!(yield* emit(l))) return;
      }
    }
  } else {
    for (let k = 0; steps++ < MAX_STEPS; k++) {
      const months = start.month - 1 + k * interval;
      const year = start.year + Math.floor(months / 12);
      const month = (months % 12) + 1;
      // A month without that day (the 31st in June) is skipped, as calendars do.
      if (start.day > daysInMonth(year, month)) {
        if (until && dayNumber({ year, month, day: 1 }) > untilDay) return;
        continue;
      }
      if (!(yield* emit({ ...start, year, month }))) return;
    }
  }
}

export interface Occurrence {
  start: Date;
  end: Date;
}

/** Occurrences overlapping [from, to), at most `limit`. */
export function occurrencesBetween(
  s: Schedule,
  from: Date,
  to: Date,
  limit = 200,
  skip: ReadonlySet<number> = new Set(),
): Occurrence[] {
  const length = s.endsAt.getTime() - s.startsAt.getTime();
  const out: Occurrence[] = [];
  const hint = new Date(from.getTime() - length);
  for (const start of occurrenceStarts(s, hint)) {
    if (start.getTime() >= to.getTime() || out.length >= limit) break;
    const end = new Date(start.getTime() + length);
    if (end.getTime() <= from.getTime() || skip.has(start.getTime())) continue;
    out.push({ start, end });
  }
  return out;
}

/** Whether `at` is one of the schedule's start times. */
export function isOccurrence(s: Schedule, at: Date): boolean {
  const next = occurrencesBetween(s, at, new Date(at.getTime() + 1), 1)[0];
  return Boolean(next && next.start.getTime() === at.getTime());
}

/** When the last occurrence ends, or null if it repeats forever. */
export function seriesEnd(s: Schedule): Date | null {
  if (!s.recurrence) return s.endsAt;
  if (s.recurrence.count === null && s.recurrence.until === null) return null;
  const length = s.endsAt.getTime() - s.startsAt.getTime();
  let last: Date | null = null;
  for (const start of occurrenceStarts(s)) last = start;
  return last ? new Date(last.getTime() + length) : s.endsAt;
}

// ── iCalendar (RFC 5545) ────────────────────────────────────────────────────

const ICAL_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function icalUtc(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function icalLocal(d: Date, tz: string): string {
  const l = utcToZoned(d, tz);
  return `${pad(l.year, 4)}${pad(l.month)}${pad(l.day)}T${pad(l.hour)}${pad(l.minute)}00`;
}

function icalDate(d: Date, tz: string): string {
  const l = utcToZoned(d, tz);
  return `${pad(l.year, 4)}${pad(l.month)}${pad(l.day)}`;
}

export function icalRRule(rule: Recurrence, s: Schedule): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly' && rule.weekdays.length) {
    parts.push(`BYDAY=${rule.weekdays.map((d) => ICAL_DAYS[d]).join(',')}`);
  }
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) {
    const end = parseLocal(`${rule.until}T23:59`);
    if (end) parts.push(`UNTIL=${icalUtc(zonedToUtc(end, s.timezone))}`);
  }
  return parts.join(';');
}

/** Text as iCalendar escapes it. Every line break goes, a lone carriage return included. */
function icalText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold to 75 octets per line, as the format requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

export interface IcalEvent extends Schedule {
  uid: string;
  title: string;
  description: string;
  location: string;
  url: string;
  allDay: boolean;
  cancelled: boolean;
  updatedAt: Date;
  /** Cancelled single dates of a repeating event. */
  exceptions: Date[];
}

/** A calendar file with these events. */
export function toIcal(events: IcalEvent[], calendarName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Magnox//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalText(calendarName)}`,
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${icalUtc(e.updatedAt)}`);
    if (e.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${icalDate(e.startsAt, e.timezone)}`,
        `DTEND;VALUE=DATE:${icalDate(e.endsAt, e.timezone)}`,
      );
    } else {
      lines.push(
        `DTSTART;TZID=${e.timezone}:${icalLocal(e.startsAt, e.timezone)}`,
        `DTEND;TZID=${e.timezone}:${icalLocal(e.endsAt, e.timezone)}`,
      );
    }
    if (e.recurrence) lines.push(`RRULE:${icalRRule(e.recurrence, e)}`);
    for (const x of e.exceptions) {
      lines.push(
        e.allDay
          ? `EXDATE;VALUE=DATE:${icalDate(x, e.timezone)}`
          : `EXDATE;TZID=${e.timezone}:${icalLocal(x, e.timezone)}`,
      );
    }
    lines.push(`SUMMARY:${icalText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icalText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icalText(e.location)}`);
    lines.push(`URL:${e.url}`);
    if (e.cancelled) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
