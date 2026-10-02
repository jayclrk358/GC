import { robloxLaunchUrl } from './community';

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
  // Steam query (A2S) games. Default ports are the query port, which some games keep apart
  // from the port players join on. "steam" adds a steam://connect link: only for games that
  // take one on the query port (the Source engine ones).
  arma3: { label: 'Arma 3', gamedig: 'arma3', defaultPort: 2303, steam: false },
  'arma-reforger': {
    label: 'Arma Reforger',
    gamedig: 'armareforger',
    defaultPort: 17777,
    steam: false,
  },
  conan: { label: 'Conan Exiles', gamedig: 'conanexiles', defaultPort: 27015, steam: false },
  css: { label: 'Counter-Strike: Source', gamedig: 'css', defaultPort: 27015, steam: true },
  cs16: {
    label: 'Counter-Strike 1.6',
    gamedig: 'counterstrike16',
    defaultPort: 27015,
    steam: true,
  },
  l4d2: { label: 'Left 4 Dead 2', gamedig: 'l4d2', defaultPort: 27015, steam: true },
  insurgency: {
    label: 'Insurgency (2014)',
    gamedig: 'insurgency',
    defaultPort: 27015,
    steam: true,
  },
  sandstorm: {
    label: 'Insurgency: Sandstorm',
    gamedig: 'insurgencysandstorm',
    defaultPort: 27131,
    steam: false,
  },
  dods: { label: 'Day of Defeat: Source', gamedig: 'dods', defaultPort: 27015, steam: true },
  nmrih: { label: 'No More Room in Hell', gamedig: 'nmrih', defaultPort: 27015, steam: true },
  hll: { label: 'Hell Let Loose', gamedig: 'hll', defaultPort: 27015, steam: false },
  'post-scriptum': {
    label: 'Squad 44 (Post Scriptum)',
    gamedig: 'postscriptum',
    defaultPort: 10037,
    steam: false,
  },
  mordhau: { label: 'Mordhau', gamedig: 'mordhau', defaultPort: 27015, steam: false },
  kf2: { label: 'Killing Floor 2', gamedig: 'killingfloor2', defaultPort: 27015, steam: false },
  zomboid: {
    label: 'Project Zomboid',
    gamedig: 'projectzomboid',
    defaultPort: 16261,
    steam: false,
  },
  unturned: { label: 'Unturned', gamedig: 'unturned', defaultPort: 27016, steam: false },
  'v-rising': { label: 'V Rising', gamedig: 'vrising', defaultPort: 27016, steam: false },
  enshrouded: { label: 'Enshrouded', gamedig: 'enshrouded', defaultPort: 15637, steam: false },
  'the-forest': { label: 'The Forest', gamedig: 'theforest', defaultPort: 27016, steam: false },
  'sons-of-the-forest': {
    label: 'Sons of the Forest',
    gamedig: 'sotf',
    defaultPort: 27016,
    steam: false,
  },
  soulmask: { label: 'Soulmask', gamedig: 'soulmask', defaultPort: 27015, steam: false },
  icarus: { label: 'Icarus', gamedig: 'icarus', defaultPort: 27015, steam: false },
  'the-front': { label: 'The Front', gamedig: 'thefront', defaultPort: 27015, steam: false },
  'abiotic-factor': {
    label: 'Abiotic Factor',
    gamedig: 'abioticfactor',
    defaultPort: 27015,
    steam: false,
  },
  hurtworld: { label: 'Hurtworld', gamedig: 'hurtworld', defaultPort: 12881, steam: false },
  'space-engineers': {
    label: 'Space Engineers',
    gamedig: 'spaceengineers',
    defaultPort: 27016,
    steam: false,
  },
  avorion: { label: 'Avorion', gamedig: 'avorion', defaultPort: 27020, steam: false },
  starbound: { label: 'Starbound', gamedig: 'starbound', defaultPort: 21025, steam: false },
  barotrauma: { label: 'Barotrauma', gamedig: 'barotrauma', defaultPort: 27016, steam: false },
  dst: { label: "Don't Starve Together", gamedig: 'dst', defaultPort: 27016, steam: false },
  ets2: { label: 'Euro Truck Simulator 2', gamedig: 'ets2', defaultPort: 27016, steam: false },
  // Other query protocols.
  samp: {
    label: 'GTA: San Andreas (SA-MP / open.mp)',
    gamedig: 'gtasam',
    defaultPort: 7777,
    steam: false,
  },
  cod4: {
    label: 'Call of Duty 4: Modern Warfare',
    gamedig: 'cod4mw',
    defaultPort: 28960,
    steam: false,
  },
  bf4: { label: 'Battlefield 4', gamedig: 'battlefield4', defaultPort: 47200, steam: false },
  // Not a server you connect to: a Roblox experience, listed by its link and polled through
  // Roblox's public games API. Its "host" is the place id and its port is 0.
  roblox: { label: 'Roblox experience', gamedig: '', defaultPort: 0, steam: false },
} as const;

export type ServerProtocol = keyof typeof SERVER_PROTOCOLS;
export const PROTOCOL_KEYS = Object.keys(SERVER_PROTOCOLS) as [ServerProtocol, ...ServerProtocol[]];

/**
 * The order to offer protocols in: the most common first, then alphabetically, with the
 * catch-all Steam query last.
 */
export function protocolsForPicker(): ServerProtocol[] {
  const pinned: ServerProtocol[] = ['minecraft', 'minecraft-bedrock', 'roblox'];
  const rest = PROTOCOL_KEYS.filter((k) => !pinned.includes(k) && k !== 'source').sort((a, b) =>
    SERVER_PROTOCOLS[a].label.localeCompare(SERVER_PROTOCOLS[b].label, 'en'),
  );
  return [...pinned, ...rest, 'source'];
}

/** One of SERVER_PROTOCOLS' own keys (`in` would also accept "toString" and the like). */
export function isServerProtocol(p: string): p is ServerProtocol {
  return Object.hasOwn(SERVER_PROTOCOLS, p);
}

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

/** Listings found by a link (a Roblox experience) rather than an address to connect to. */
export function isLinkProtocol(protocol: string): protocol is 'roblox' {
  return protocol === 'roblox';
}

export function connectLink(protocol: ServerProtocol, host: string, port: number): string | null {
  if (isLinkProtocol(protocol)) return robloxLaunchUrl(host);
  if (!SERVER_PROTOCOLS[protocol].steam) return null;
  const h = host.includes(':') ? `[${host}]` : host;
  return `steam://connect/${h}:${port}`;
}

export function displayAddress(protocol: ServerProtocol, host: string, port: number): string {
  if (isLinkProtocol(protocol)) return `roblox.com/games/${host}`;
  const h = host.includes(':') ? `[${host}]` : host;
  return port === SERVER_PROTOCOLS[protocol].defaultPort ? h : `${h}:${port}`;
}

// ── Browser, history, votes ────────────────────────────────────────────────

export const SERVER_SORTS = ['players', 'votes', 'new', 'name'] as const;
export type ServerSort = (typeof SERVER_SORTS)[number];

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

/** Details carried by "server down" / "back up" chat notices. */
export interface ServerAlertMeta {
  serverId: string;
  serverName: string;
  /** How long it was down (back-up notices only). */
  downtimeMs?: number;
}

export const SERVER_ALERT_KINDS = ['server_down', 'server_up'] as const;
export type ServerAlertKind = (typeof SERVER_ALERT_KINDS)[number];

/** "2 h 5 min", "45 min", "1 day 3 h": short, human durations for alerts and cooldowns. */
export function formatDuration(ms: number, locale = 'en'): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (locale === 'en') {
    if (minutes < 60) return `${minutes} min`;
    const rest = minutes % 60;
    if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
    const h = hours % 24;
    return `${days} ${days === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
  }
  // Other languages: their own unit names ("3 días 2 h", "5 Min.").
  const unit = (n: number, u: 'minute' | 'hour' | 'day', long = false) =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: u,
      unitDisplay: long ? 'long' : 'short',
    }).format(n);
  if (minutes < 60) return unit(minutes, 'minute');
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${unit(hours, 'hour')} ${unit(rest, 'minute')}` : unit(hours, 'hour');
  }
  const h = hours % 24;
  return h ? `${unit(days, 'day', true)} ${unit(h, 'hour')}` : unit(days, 'day', true);
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
