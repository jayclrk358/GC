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
