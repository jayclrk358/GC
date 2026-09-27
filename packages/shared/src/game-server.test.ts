import { describe, expect, it } from 'vitest';
import {
  fillSeries,
  formatDuration,
  serverIntegrationsSchema,
  serverSearchSchema,
  summariseHistory,
} from './game-server';

describe('serverSearchSchema', () => {
  it('parses query strings leniently', () => {
    expect(
      serverSearchSchema.parse({ online: '1', minPlayers: '5', sort: 'votes', page: '2', q: '  ' }),
    ).toEqual({
      q: undefined,
      game: undefined,
      tag: undefined,
      region: undefined,
      minPlayers: 5,
      online: true,
      sort: 'votes',
      page: 2,
    });
    expect(serverSearchSchema.parse({ sort: 'bogus', page: '-3', minPlayers: 'x' })).toMatchObject({
      sort: 'players',
      page: 0,
      minPlayers: undefined,
      online: false,
    });
  });
});

describe('serverIntegrationsSchema', () => {
  it('normalises Votifier settings; a blank secret means "keep the saved one"', () => {
    expect(
      serverIntegrationsSchema.parse({ votifierHost: 'Play.Example.com', votifierPort: 8192 }),
    ).toMatchObject({ votifierHost: 'play.example.com', votifierToken: null });
    expect(
      serverIntegrationsSchema.safeParse({ votifierHost: 'not a host!', votifierToken: 'x' })
        .success,
    ).toBe(false);
    expect(
      serverIntegrationsSchema.safeParse({
        votifierHost: 'play.example.com',
        votifierPublicKey: 'short',
      }).success,
    ).toBe(false);
    expect(
      serverIntegrationsSchema.parse({
        votifierHost: 'play.example.com',
        votifierPort: 8192,
        votifierToken: 'abc',
      }),
    ).toMatchObject({
      votifierHost: 'play.example.com',
      votifierToken: 'abc',
      votifierPublicKey: null,
    });
    expect(serverIntegrationsSchema.parse({})).toMatchObject({
      alertChannelId: null,
      votifierHost: null,
    });
  });
});

describe('history', () => {
  const hour = 3600_000;
  const from = new Date('2026-05-01T00:00:00Z');
  const to = new Date(from.getTime() + 4 * hour);
  it('fills gaps and computes uptime per bucket', () => {
    const points = fillSeries(
      [
        { bucket: new Date(from.getTime()), samples: 60, online: 60, avgPlayers: 12.34, peak: 20 },
        {
          bucket: new Date(from.getTime() + 2 * hour).toISOString(),
          samples: 60,
          online: 30,
          avgPlayers: 5,
          peak: 9,
        },
        {
          bucket: new Date(from.getTime() + 3 * hour),
          samples: 60,
          online: 0,
          avgPlayers: null,
          peak: null,
        },
      ],
      from,
      to,
      hour,
    );
    expect(points).toEqual([
      { t: '2026-05-01T00:00:00.000Z', players: 12.3, peak: 20, uptime: 1 },
      { t: '2026-05-01T01:00:00.000Z', players: null, peak: null, uptime: null },
      { t: '2026-05-01T02:00:00.000Z', players: 5, peak: 9, uptime: 0.5 },
      { t: '2026-05-01T03:00:00.000Z', players: null, peak: null, uptime: 0 },
    ]);
    expect(summariseHistory(points, { samples: 180, online: 90 })).toEqual({
      uptime: 0.5,
      avgPlayers: 8.7,
      peakPlayers: 20,
    });
  });
});

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(30_000)).toBe('1 min');
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration(125 * 60_000)).toBe('2 h 5 min');
    expect(formatDuration(27 * 3600_000)).toBe('1 day 3 h');
  });
});
