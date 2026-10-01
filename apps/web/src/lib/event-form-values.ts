import 'server-only';
import { localDateKey, utcToZoned, type Recurrence } from '@magnox/shared';
import type { EventFormValues } from '@/components/events/event-form';

const pad = (n: number) => String(n).padStart(2, '0');

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A new event: tomorrow evening, on the organiser's clock. */
export function newEventValues(timeZone: string): EventFormValues {
  const tomorrow = utcToZoned(new Date(Date.now() + 86_400_000), timeZone);
  const date = localDateKey(tomorrow);
  return {
    title: '',
    description: '',
    location: '',
    timezone: timeZone,
    startDate: date,
    startTime: '19:00',
    endDate: date,
    endTime: '21:00',
    allDay: false,
    repeat: 'none',
    interval: 1,
    weekdays: [],
    ends: 'never',
    until: '',
    count: 10,
    capacity: 0,
  };
}

/** An existing event's values, on its own clock. */
export function eventValues(e: {
  title: string;
  description: string;
  location: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  capacity: number;
  recurrence: Recurrence | null;
}): EventFormValues {
  const s = utcToZoned(new Date(e.startsAt), e.timezone);
  const end = utcToZoned(new Date(e.endsAt), e.timezone);
  const endDate = localDateKey(end);
  const r = e.recurrence;
  return {
    title: e.title,
    description: e.description,
    location: e.location,
    timezone: e.timezone,
    startDate: localDateKey(s),
    startTime: `${pad(s.hour)}:${pad(s.minute)}`,
    // All-day events end at midnight after their last day; the form shows that last day.
    endDate: e.allDay ? previousDay(endDate) : endDate,
    endTime: `${pad(end.hour)}:${pad(end.minute)}`,
    allDay: e.allDay,
    repeat: r?.freq ?? 'none',
    interval: r?.interval ?? 1,
    weekdays: r?.weekdays ?? [],
    ends: r?.count ? 'after' : r?.until ? 'on' : 'never',
    until: r?.until ?? '',
    count: r?.count ?? 10,
    capacity: e.capacity,
  };
}
