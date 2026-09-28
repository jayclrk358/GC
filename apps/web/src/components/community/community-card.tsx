import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import type { CommunityCard as Card } from '@magnox/core';
import { mediaUrl } from '@/lib/media';
import { formatCount } from '@/lib/utils';
import { Badge } from '@/components/ui/misc';
import { PlanBadge } from '@/components/billing/plan-badge';

/** Card preview in the community's own colours (light set, contrast-checked). */
export async function CommunityCard({ c }: { c: Card }) {
  const t = await getTranslations('community');
  const tp = await getTranslations('plans');
  const theme = c.theme;
  const icon = mediaUrl(theme.iconKey);
  const banner = mediaUrl(theme.bannerKey);
  return (
    <article className="group mx-card relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative h-24" data-decorative aria-hidden>
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner}
            alt=""
            loading="lazy"
            decoding="async"
            className="mx-card-media size-full object-cover"
            style={{ objectPosition: `50% ${theme.bannerFocalY}%` }}
          />
        ) : (
          <div
            className="mx-card-media size-full"
            style={{
              background: `linear-gradient(135deg, ${theme.light.primary}, ${theme.light.accent})`,
            }}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
        {/* Above the (positioned) banner so the logo isn't cut off. */}
        <div className="relative z-10 -mt-7">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={icon}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-14 rounded-xl border-4 border-surface bg-surface object-cover shadow-sm"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-14 place-items-center rounded-xl border-4 border-surface text-xl font-extrabold shadow-sm"
              style={{ background: theme.light.primary, color: theme.light.onPrimary }}
            >
              {c.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold">
          <Link
            href={`/c/${c.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {c.name}
          </Link>
        </h3>
        {c.tagline && <p className="line-clamp-2 text-sm text-muted">{c.tagline}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-sm">
          <PlanBadge plan={c.plan} label={tp(`names.${c.plan}`)} />
          {c.gameName && <Badge tone="primary">{c.gameName}</Badge>}
          <span className="flex items-center gap-1 text-muted">
            <Users className="size-4" aria-hidden />
            {t('memberCount', { count: c.memberCount, formatted: formatCount(c.memberCount) })}
          </span>
        </div>
      </div>
    </article>
  );
}
