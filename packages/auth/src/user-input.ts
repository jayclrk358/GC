/** Longest display name. Names show up across the site and in emails, so they're kept short. */
export const MAX_NAME_LENGTH = 64;

const length = (s: string) => [...s].length;

/** A display name cut to the allowed length (for names from sign-in providers, not typed here). */
export function clampName(name: string): string {
  const trimmed = name.trim();
  return length(trimmed) > MAX_NAME_LENGTH
    ? [...trimmed].slice(0, MAX_NAME_LENGTH).join('').trim()
    : trimmed;
}

/**
 * Why one of Better Auth's own endpoints must refuse a request, if it must. Display names are
 * capped. Avatars only change through the app's profile settings, which check the image is the
 * person's own upload; `/update-user` would otherwise take any URL at all.
 */
export function userInputProblem(path: string, body: unknown): string | null {
  if (path !== '/sign-up/email' && path !== '/update-user') return null;
  if (!body || typeof body !== 'object') return null;
  const fields = body as Record<string, unknown>;
  if (path === '/update-user' && 'image' in fields) {
    return 'Change your avatar in your profile settings.';
  }
  if (typeof fields.name === 'string' && length(fields.name.trim()) > MAX_NAME_LENGTH) {
    return `Names can be at most ${MAX_NAME_LENGTH} characters.`;
  }
  return null;
}
