import { describe, expect, it } from 'vitest';
import { dateParts, eventTiming, formatTimes, nearDay } from './event-format';

const london = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h' as const };
const now = new Date('2026-10-04T12:00:00Z'); // 13:00 in London

describe('eventTiming', () => {
  const at = (iso: string, hours = 2) =>
    eventTiming(iso, new Date(new Date(iso).getTime() + hours * 3_600_000), now, london);

  it('knows when an event is on or over', () => {
    expect(at('2026-10-04T11:00:00Z')).toEqual({ state: 'now' });
    expect(at('2026-10-04T08:00:00Z')).toEqual({ state: 'ended' });
  });

  it('counts minutes, then hours, then days, weeks and months', () => {
    expect(at('2026-10-04T12:25:00Z')).toEqual({ state: 'soon', when: 'in 25 minutes' });
    expect(at('2026-10-04T17:00:00Z')).toEqual({ state: 'soon', when: 'in 5 hours' });
    expect(at('2026-10-05T19:00:00Z')).toEqual({ state: 'later', when: 'tomorrow' });
    expect(at('2026-10-08T19:00:00Z')).toEqual({ state: 'later', when: 'in 4 days' });
    expect(at('2026-10-25T19:00:00Z')).toEqual({ state: 'later', when: 'in 3 weeks' });
    expect(at('2027-01-04T19:00:00Z')).toEqual({ state: 'later', when: 'in 3 months' });
  });

  it('says hours for early tomorrow, not "tomorrow"', () => {
    // 22:30 in London, for an event at 02:00: three and a half hours away.
    const late = new Date('2026-10-04T21:30:00Z');
    expect(eventTiming('2026-10-05T01:00:00Z', '2026-10-05T03:00:00Z', late, london)).toEqual({
      state: 'soon',
      when: 'in 4 hours',
    });
  });

  it('speaks the viewer’s language', () => {
    expect(at('2026-10-05T19:00:00Z', 2)).toEqual({ state: 'later', when: 'tomorrow' });
    expect(
      eventTiming('2026-10-05T19:00:00Z', '2026-10-05T21:00:00Z', now, { ...london, locale: 'de' }),
    ).toEqual({ state: 'later', when: 'morgen' });
  });
});

describe('nearDay', () => {
  it('names today and tomorrow on the viewer’s clock, and nothing else', () => {
    expect(nearDay('2026-10-04T20:00:00Z', now, london)).toBe('Today');
    expect(nearDay('2026-10-05T08:00:00Z', now, london)).toBe('Tomorrow');
    // 23:30 UTC on the 4th is already the 5th in Tokyo.
    expect(nearDay('2026-10-04T23:30:00Z', now, { ...london, timeZone: 'Asia/Tokyo' })).toBe(
      'Tomorrow',
    );
    expect(nearDay('2026-10-07T08:00:00Z', now, london)).toBeNull();
    expect(nearDay('2026-10-05T08:00:00Z', now, { ...london, locale: 'fr' })).toBe('Demain');
  });
});

describe('formatTimes and dateParts', () => {
  it('gives the times on the day, or none for all-day events', () => {
    expect(formatTimes('2026-10-06T19:00:00Z', '2026-10-06T21:30:00Z', false, london)).toBe(
      '20:00 – 22:30',
    );
    expect(formatTimes('2026-10-06T22:00:00Z', '2026-10-07T01:00:00Z', false, london)).toBe(
      '23:00 – Wed 2:00',
    );
    expect(formatTimes('2026-10-06T00:00:00Z', '2026-10-07T00:00:00Z', true, london)).toBeNull();
  });

  it('splits a date for a tile', () => {
    expect(dateParts('2026-10-06T19:00:00Z', london)).toEqual({
      month: 'Oct',
      day: '6',
      weekday: 'Tue',
    });
  });
});
