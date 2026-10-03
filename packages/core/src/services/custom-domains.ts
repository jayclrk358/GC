import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { and, eq, isNull, lt, ne } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import { customDomainSchema, domainVerifyRecord, Permission, planPerks } from '@gamecentral/shared';
import { requirePerm, type MemberContext } from '../access';
import { domainCacheKey } from '../domain-lookup';
import { env } from '../env';
import { AppError, conflict, isUniqueViolation } from '../errors';
import { enforceRateLimit } from '../ratelimit';
import { uncache } from '../cache';
import { audit } from './audit';
import { assertPlanPerk, communityPlan } from './billing';

// Custom domains: a community's public pages on its own address. Caddy fetches a certificate on
// the first visit (on-demand TLS), but only for domains verified here.

/** The host people point their domain at (a CNAME), normally the site's own. */
export function customDomainTarget(): string {
  return env().CUSTOM_DOMAIN_TARGET || new URL(env().APP_URL).hostname;
}

export interface CustomDomainView {
  domain: string | null;
  verified: boolean;
  /** The TXT record to add. */
  record: { name: string; value: string } | null;
  /** What to point the domain at. */
  target: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  /** The community's plan includes custom domains. */
  allowed: boolean;
}

export async function getCustomDomain(ctx: MemberContext): Promise<CustomDomainView> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const [row, plan] = await Promise.all([
    db.query.customDomains.findFirst({
      where: eq(schema.customDomains.communityId, ctx.community.id),
    }),
    communityPlan(ctx.community.id),
  ]);
  return {
    domain: row?.domain ?? null,
    verified: Boolean(row?.verifiedAt),
    record: row ? domainVerifyRecord(row.domain, row.verifyToken) : null,
    target: customDomainTarget(),
    lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    allowed: planPerks(plan).customDomain,
  };
}

async function forgetDomain(domain: string | null | undefined) {
  if (!domain) return;
  await uncache(domainCacheKey(domain));
}

/** Domains that belong to Game Central itself can't be claimed. */
function isOwnDomain(domain: string): boolean {
  const own = [new URL(env().APP_URL).hostname, customDomainTarget()];
  try {
    own.push(new URL(env().MEDIA_BASE_URL).hostname);
  } catch {
    // No separate media host.
  }
  return own.some((h) => domain === h || domain.endsWith(`.${h}`));
}

/**
 * How long another community's claim on a domain holds it without being verified. After that a
 * new claim takes it over, so nobody can sit on someone else's domain by never verifying it.
 */
const UNVERIFIED_CLAIM_MS = 7 * 86_400_000;

/** Set (or change) the community's domain. It needs verifying again before it works. */
export async function setCustomDomain(ctx: MemberContext, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  await assertPlanPerk(ctx.community.id, 'customDomain', 'Custom domains');
  const domain = customDomainSchema.parse(raw);
  if (isOwnDomain(domain)) {
    throw new AppError('validation', 'That address belongs to this site. Use your own domain.', {
      fields: { domain: 'Use your own domain' },
    });
  }
  const before = await db.query.customDomains.findFirst({
    where: eq(schema.customDomains.communityId, ctx.community.id),
  });
  if (before?.domain === domain) return;
  const values = {
    domain,
    verifyToken: randomBytes(16).toString('hex'),
    verifiedAt: null,
    lastCheckedAt: null,
    lastError: null,
    // When it was claimed, for how long an unverified claim holds the domain.
    createdAt: new Date(),
  };
  try {
    await db.transaction(async (tx) => {
      const released = await tx
        .delete(schema.customDomains)
        .where(
          and(
            eq(schema.customDomains.domain, domain),
            ne(schema.customDomains.communityId, ctx.community.id),
            isNull(schema.customDomains.verifiedAt),
            lt(schema.customDomains.createdAt, new Date(Date.now() - UNVERIFIED_CLAIM_MS)),
          ),
        )
        .returning({ communityId: schema.customDomains.communityId });
      for (const r of released) {
        await audit(tx, {
          communityId: r.communityId,
          actorId: null,
          action: 'domain.remove',
          diff: { domain },
          reason: 'Never verified, and claimed by another community',
        });
      }
      await tx
        .insert(schema.customDomains)
        .values({ communityId: ctx.community.id, ...values })
        .onConflictDoUpdate({ target: schema.customDomains.communityId, set: values });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(
        'Another community already uses that domain. (A claim that’s never verified lapses after a week.)',
      );
    }
    throw e;
  }
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'domain.set',
    diff: { domain },
  });
  await forgetDomain(before?.domain);
}

export async function removeCustomDomain(ctx: MemberContext): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const [row] = await db
    .delete(schema.customDomains)
    .where(eq(schema.customDomains.communityId, ctx.community.id))
    .returning({ domain: schema.customDomains.domain });
  if (!row) return;
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'domain.remove',
    diff: { domain: row.domain },
  });
  await forgetDomain(row.domain);
}

/** DNS lookups, swappable in tests. */
export interface DomainResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
}

const quiet = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

/** The system's resolver, or the ones in DNS_SERVERS. */
function defaultResolver(): DomainResolver {
  const servers = env()
    .DNS_SERVERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!servers.length) return dns;
  const r = new dns.Resolver({ timeout: 3000, tries: 2 });
  r.setServers(servers);
  return r;
}

/**
 * Check a domain's DNS: the TXT record proves it's theirs, and the domain must lead here (a CNAME
 * to the target, or the same addresses). Returns a reason it isn't ready, or null when it is.
 */
export async function checkDomainDns(
  domain: string,
  token: string,
  target: string,
  resolver: DomainResolver = defaultResolver(),
): Promise<string | null> {
  const record = domainVerifyRecord(domain, token);
  const txt = (await quiet(resolver.resolveTxt(record.name))).map((parts) => parts.join(''));
  if (!txt.includes(record.value)) {
    return `The TXT record isn’t there yet. Add ${record.name} with the value ${record.value}. DNS changes can take a while to show up.`;
  }
  const cname = (await quiet(resolver.resolveCname(domain))).map((c) =>
    c.toLowerCase().replace(/\.$/, ''),
  );
  if (cname.includes(target)) return null;
  const [mine4, mine6, theirs4, theirs6] = await Promise.all([
    quiet(resolver.resolve4(target)),
    quiet(resolver.resolve6(target)),
    quiet(resolver.resolve4(domain)),
    quiet(resolver.resolve6(domain)),
  ]);
  const ours = new Set([...mine4, ...mine6]);
  const theirs = [...theirs4, ...theirs6];
  if (theirs.length && theirs.every((ip) => ours.has(ip))) return null;
  return `The TXT record is right, but ${domain} doesn’t point here yet. Add a CNAME record for it pointing to ${target}.`;
}

/** Check the DNS now and, if it's right, switch the domain on. */
export async function verifyCustomDomain(
  ctx: MemberContext,
  resolver?: DomainResolver,
): Promise<{ verified: boolean; error: string | null }> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  await enforceRateLimit(`domain-check:${ctx.community.id}`, 10, 600, 'Wait a few minutes.');
  const row = await db.query.customDomains.findFirst({
    where: eq(schema.customDomains.communityId, ctx.community.id),
  });
  if (!row) throw new AppError('bad_request', 'Add a domain first.');
  await assertPlanPerk(ctx.community.id, 'customDomain', 'Custom domains');
  const error = await checkDomainDns(row.domain, row.verifyToken, customDomainTarget(), resolver);
  await db
    .update(schema.customDomains)
    .set({
      lastCheckedAt: new Date(),
      lastError: error,
      ...(error ? {} : { verifiedAt: row.verifiedAt ?? new Date() }),
    })
    .where(eq(schema.customDomains.communityId, ctx.community.id));
  if (!error && !row.verifiedAt) {
    await audit(db, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'domain.verify',
      diff: { domain: row.domain },
    });
  }
  await forgetDomain(row.domain);
  return { verified: !error, error };
}
