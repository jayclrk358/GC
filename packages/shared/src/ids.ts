import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUIDv7, generated in the app (Postgres 16 has no native v7). */
export function newId(): string {
  return uuidv7();
}

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

/** Short random token, unambiguous characters only (invite codes, verification tokens). */
export function randomToken(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** The earliest UUIDv7 for a moment in time: every id generated at or after it sorts higher. */
export function uuidAtTime(date: Date | number): string {
  const ms = Math.max(0, Math.floor(typeof date === 'number' ? date : date.getTime()));
  const hex = ms.toString(16).padStart(12, '0').slice(-12);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-000000000000`;
}

/** Milliseconds since the epoch encoded in a UUIDv7. */
export function timeOfUuid(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
