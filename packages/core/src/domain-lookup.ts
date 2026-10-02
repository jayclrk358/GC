import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { planPerks } from '@magnox/shared';
import { cached } from './cache';

// Kept apart from the custom domain service so the realtime server can use it without loading
// billing and the rest.

export const domainCacheKey = (domain: string) => `domain:${domain}`;

/**
 * The community a verified custom domain belongs to (its slug), or null. Communities that are
 * deleted, suspended or no longer on a plan with custom domains don't get one. Cached a minute.
 */
export async function communityForDomain(host: string): Promise<string | null> {
  const domain = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!domain.includes('.') || domain.length > 253) return null;
  return cached(domainCacheKey(domain), 60, async () => {
    const [row] = await db
      .select({ slug: schema.communities.slug, plan: schema.communities.plan })
      .from(schema.customDomains)
      .innerJoin(schema.communities, eq(schema.communities.id, schema.customDomains.communityId))
      .where(
        and(
          eq(schema.customDomains.domain, domain),
          isNotNull(schema.customDomains.verifiedAt),
          isNull(schema.communities.deletedAt),
          isNull(schema.communities.suspendedAt),
        ),
      )
      .limit(1);
    return row && planPerks(row.plan).customDomain ? row.slug : null;
  });
}
