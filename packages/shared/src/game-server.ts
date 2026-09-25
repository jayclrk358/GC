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
    label: 'Source / Steam query (A2S)',
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
  fivem: { label: 'FiveM (GTA V)', gamedig: 'fivem', defaultPort: 30120, steam: false },
  terraria: { label: 'Terraria (TShock)', gamedig: 'terraria', defaultPort: 7777, steam: false },
  palworld: { label: 'Palworld', gamedig: 'palworld', defaultPort: 8211, steam: false },
  sevendays: { label: '7 Days to Die', gamedig: '7d2d', defaultPort: 26900, steam: true },
  dayz: { label: 'DayZ', gamedig: 'dayz', defaultPort: 2302, steam: true },
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
