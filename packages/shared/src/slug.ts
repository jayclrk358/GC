export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Paths that must never be taken by a community slug. */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'c',
  'communities',
  'community',
  'explore',
  'help',
  'home',
  'login',
  'logout',
  'magnox',
  'media',
  'new',
  'notifications',
  'register',
  'search',
  'servers',
  'settings',
  'sign-in',
  'sign-up',
  'signin',
  'signup',
  'socket.io',
  'static',
  'support',
  'u',
  'user',
  'users',
  'www',
  'invite',
  'about',
  'terms',
  'privacy',
  'status',
  'docs',
  'moderation',
]);

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes('--') && !RESERVED_SLUGS.has(slug);
}
