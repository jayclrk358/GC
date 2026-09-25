import { isSlugAvailable } from '@magnox/core';
import { isValidSlug } from '@magnox/shared';

export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get('slug') ?? '').trim().toLowerCase();
  if (!isValidSlug(slug)) return Response.json({ slug, valid: false, available: false });
  return Response.json({ slug, valid: true, available: await isSlugAvailable(slug) });
}
