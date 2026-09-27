import { z } from 'zod';

/** Protocols we know how to query, mapped to GameDig types. */
export const SERVER_PROTOCOLS = {
  minecraft: { label: 'Minecraft (Java)', gamedig: 'minecraft', defaultPort: 25565, steam: false },
  'minecraft-bedrock': {
    label: 'Minecraft (Bedrock)',
    gamedig: 'mbe',
    defaultPort: 19132,
    steam: false,
  },
  source: {
    label: 'Other Steam game (A2S query)',
    gamedig: 'protocol-valve',
    defaultPort: 27015,
    steam: true,
  },
  cs2: { label: 'Counter-Strike 2', gamedig: 'counterstrike2', defaultPort: 27015, steam: true },
  rust: { label: 'Rust', gamedig: 'rust', defaultPort: 28015, steam: true },
  ark: { label: 'ARK: Survival Evolved', gamedig: 'ase', defaultPort: 27015, steam: true },
  gmod: { label: "Garry's Mod", gamedig: 'garrysmod', defaultPort: 27015, steam: true },
  tf2: { label: 'Team Fortress 2', gamedig: 'teamfortress2', defaultPort: 27015, steam: true },
  valheim: { label: 'Valheim', gamedig: 'valheim', defaultPort: 2457, steam: true },
  fivem: { label: 'FiveM (GTA V)', gamedig: 'gta5f', defaultPort: 30120, steam: false },
  terraria: {
    label: 'Terraria (TShock)',
    gamedig: 'terrariatshock',
    defaultPort: 7777,
    steam: false,
  },
  sevendays: { label: '7 Days to Die', gamedig: 'sdtd', defaultPort: 26900, steam: true },
  dayz: { label: 'DayZ', gamedig: 'dayz', defaultPort: 27016, steam: true },
  squad: { label: 'Squad', gamedig: 'squad', defaultPort: 27165, steam: true },
} as const;

export type ServerProtocol = keyof typeof SERVER_PROTOCOLS;
export const PROTOCOL_KEYS = Object.keys(SERVER_PROTOCOLS) as [ServerProtocol, ...ServerProtocol[]];

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$|^\d{1,3}(?:\.\d{1,3}){3}$|^\[?[0-9a-f:]{2,39}\]?$/i;

export const serverInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  protocol: z.enum(PROTOCOL_KEYS),
  host: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(HOSTNAME_RE, 'Enter a hostname like play.example.com or an IP address')
    .transform((h) => h.replace(/^\[|\]$/g, '')),
  port: z.number().int().min(1).max(65535),
  description: z.string().trim().max(500).default(''),
  tags: z.array(z.string().trim().toLowerCase().max(24)).max(8).default([]),
  region: z.string().max(32).default('global'),
  listed: z.boolean().default(true),
});
export type ServerInput = z.infer<typeof serverInputSchema>;

export interface ServerStatus {
  online: boolean;
  players: number | null;
  maxPlayers: number | null;
  map: string | null;
  version: string | null;
  pingMs: number | null;
  name: string | null;
  checkedAt: string | null;
}

export function connectLink(protocol: ServerProtocol, host: string, port: number): string | null {
  if (!SERVER_PROTOCOLS[protocol].steam) return null;
  const h = host.includes(':') ? `[${host}]` : host;
  return `steam://connect/${h}:${port}`;
}

export function displayAddress(protocol: ServerProtocol, host: string, port: number): string {
  const h = host.includes(':') ? `[${host}]` : host;
  return port === SERVER_PROTOCOLS[protocol].defaultPort ? h : `${h}:${port}`;
}

// ── Browser, history, votes ────────────────────────────────────────────────

export const SERVER_SORTS = ['players', 'votes', 'new', 'name'] as const;
export type ServerSort = (typeof SERVER_SORTS)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

/** Server browser filters, parsed from the query string (every field optional). */
export const serverSearchSchema = z.object({
  q: optionalText(100),
  game: optionalText(64),
  tag: optionalText(24).transform((v) => v?.toLowerCase()),
  region: optionalText(32),
  minPlayers: z.coerce.number().int().min(0).max(100_000).optional().catch(undefined),
  online: z
    .union([z.literal('1'), z.literal('true'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === '1' || v === 'true')
    .catch(false),
  sort: z.enum(SERVER_SORTS).catch('players').default('players'),
  page: z.coerce.number().int().min(0).max(1000).catch(0).default(0),
});
export type ServerSearch = z.infer<typeof serverSearchSchema>;

export const HISTORY_RANGES = ['24h', '7d', '30d'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** Bucket size per chart range, so each chart has roughly 100-170 points. */
export const HISTORY_BUCKETS: Record<HistoryRange, { hours: number; bucketMinutes: number }> = {
  '24h': { hours: 24, bucketMinutes: 15 },
  '7d': { hours: 24 * 7, bucketMinutes: 60 },
  '30d': { hours: 24 * 30, bucketMinutes: 360 },
};

export const VOTE_COOLDOWN_MS = 24 * 3600 * 1000;

/** Minecraft Java usernames: 3-16 letters, digits and underscores. */
export const MINECRAFT_NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export const voteInputSchema = z.object({
  username: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => v || undefined),
  turnstileToken: z.string().max(4096).optional(),
});

/** Chat alerts and Votifier settings for a server listing. */
export const serverIntegrationsSchema = z
  .object({
    alertChannelId: z.string().uuid().nullable().default(null),
    votifierHost: z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || HOSTNAME_RE.test(v), 'Enter a hostname or IP address'),
    votifierPort: z.number().int().min(1).max(65535).nullable().default(null),
    votifierToken: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || null),
    votifierPublicKey: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v ? v.replace(/-----(BEGIN|END) PUBLIC KEY-----|\s+/g, '') : null))
      .refine(
        (v) => v === null || /^[A-Za-z0-9+/=]{200,1000}$/.test(v),
        'Paste the public.key contents',
      ),
  })
  .refine((v) => !v.votifierHost || v.votifierToken || v.votifierPublicKey, {
    message: 'Add a NuVotifier token or a Votifier public key',
    path: ['votifierToken'],
  });
export type ServerIntegrations = z.infer<typeof serverIntegrationsSchema>;

/** "2 h 5 min", "45 min", "1 day 3 h": short, human durations for alerts and cooldowns. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return `${days} ${days === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
}

export interface HistoryPoint {
  /** Bucket start, ISO time. */
  t: string;
  /** Average players while online; null when there's no data or the server was offline. */
  players: number | null;
  peak: number | null;
  /** Share of checks that found the server online (0..1), or null with no data. */
  uptime: number | null;
}

/**
 * Lay query results onto a regular grid of buckets so gaps (no data) show as gaps rather than
 * being joined up by a line.
 */
export function fillSeries(
  rows: {
    bucket: Date | string;
    samples: number;
    online: number;
    avgPlayers: number | null;
    peak: number | null;
  }[],
  from: Date,
  to: Date,
  bucketMs: number,
): HistoryPoint[] {
  const byTime = new Map(rows.map((r) => [new Date(r.bucket).getTime(), r]));
  const start = Math.floor(from.getTime() / bucketMs) * bucketMs;
  const out: HistoryPoint[] = [];
  for (let t = start; t < to.getTime(); t += bucketMs) {
    const r = byTime.get(t);
    out.push({
      t: new Date(t).toISOString(),
      players:
        r && r.online > 0 && r.avgPlayers !== null ? Math.round(r.avgPlayers * 10) / 10 : null,
      peak: r && r.online > 0 ? r.peak : null,
      uptime: r && r.samples > 0 ? r.online / r.samples : null,
    });
  }
  return out;
}

export function summariseHistory(
  points: HistoryPoint[],
  totals: { samples: number; online: number },
) {
  const players = points.map((p) => p.players).filter((p): p is number => p !== null);
  const peaks = points.map((p) => p.peak).filter((p): p is number => p !== null);
  return {
    uptime: totals.samples ? totals.online / totals.samples : null,
    avgPlayers: players.length
      ? Math.round((players.reduce((a, b) => a + b, 0) / players.length) * 10) / 10
      : null,
    peakPlayers: peaks.length ? Math.max(...peaks) : null,
  };
}
