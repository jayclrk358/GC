import { z } from 'zod';
import { PROTOCOL_KEYS, SERVER_SORTS } from './game-server';

// Input validation for game servers, the browser and votes (constants are in game-server.ts).

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
export const serverIntegrationsSchema = z.object({
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
});
// A blank token or key means "keep the saved one", so "one of them is required" is checked by the
// service against what's stored.
export type ServerIntegrations = z.infer<typeof serverIntegrationsSchema>;
