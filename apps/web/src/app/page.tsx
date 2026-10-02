import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  Accessibility,
  ArrowRight,
  CalendarDays,
  Gamepad2,
  LayoutTemplate,
  MessagesSquare,
  Palette,
  Radio,
  Server,
  type LucideIcon,
} from 'lucide-react';
import { exploreCommunities, listPublicServers, platformStats } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/ui/count-up';
import { CommunityCard } from '@/components/community/community-card';
import { LiveServerRow } from '@/components/servers/live-server-row';
import { getUser } from '@/lib/auth';
import { AutoRefresh } from '@/components/live/live';
import { cn, formatCount } from '@/lib/utils';

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Bento placement from the md breakpoint up. */
  span: string;
}

const FEATURES: Feature[] = [
  {
    icon: Palette,
    title: 'Make it yours',
    body: 'Themes, fonts, banners and a drag-and-drop page builder. Every theme is contrast-checked, in light and dark.',
    span: 'md:col-span-4 md:row-span-2',
  },
  {
    icon: Server,
    title: 'Live server status',
    body: 'Minecraft, Rust, CS2, FiveM and more, with player charts and daily votes.',
    span: 'md:col-span-2',
  },
  {
    icon: MessagesSquare,
    title: 'Forum + chat',
    body: 'Searchable discussions that last, and real-time channels when you need them.',
    span: 'md:col-span-2',
  },
  {
    icon: CalendarDays,
    title: 'Events & wiki',
    body: 'Plan game nights across time zones and build a knowledge base together.',
    span: 'md:col-span-2',
  },
  {
    icon: LayoutTemplate,
    title: 'Roles & permissions',
    body: 'Fine-grained roles, channel overrides, invites and moderation tools.',
    span: 'md:col-span-2',
  },
  {
    icon: Accessibility,
    title: 'Accessible by default',
    body: 'High contrast, dyslexia-friendly fonts, reduced motion and full keyboard control.',
    span: 'md:col-span-2',
  },
];

/** Decorative preview of theme swatches for the big bento tile. */
const SWATCHES = ['#5b21b6', '#0a7c73', '#b91c3c', '#2563eb', '#a16207', '#15803d'];

export default async function HomePage() {
  const t = await getTranslations('home');
  const locale = await getLocale();
  const [user, stats, live, trending] = await Promise.all([
    getUser(),
    platformStats(),
    listPublicServers({ limit: 5 }),
    exploreCommunities({ pageSize: 6 }),
  ]);
  const createHref = user ? '/new' : '/sign-up?next=/new';
  const figures = [
    { label: t('statCommunities'), value: stats.communities },
    { label: t('statServers'), value: stats.serversOnline },
    { label: t('statPlayers'), value: stats.players },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Server rows update live; the rest (stats, lists) every 5 min. */}
      <AutoRefresh every={300} away={120} />
      <section
        aria-labelledby="hero-h"
        className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface px-6 py-10 sm:px-10 sm:py-14"
      >
        <div aria-hidden className="mx-dots absolute inset-0 -z-10" />
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="mx-stagger flex flex-col items-start gap-6">
            <p className="flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1 text-sm font-medium text-muted">
              <Gamepad2 className="size-4 text-primary" aria-hidden />
              {t('eyebrow')}
            </p>
            <h1
              id="hero-h"
              className="text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl"
            >
              {t.rich('heroTitle', {
                hl: (chunks) => <span className="mx-gradient-text">{chunks}</span>,
              })}
            </h1>
            <p className="max-w-xl text-lg text-muted">{t('heroBody')}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="group">
                <Link href={createHref}>
                  {t('getStarted')}
                  <ArrowRight
                    aria-hidden
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/servers">
                  <Server aria-hidden />
                  {t('findServers')}
                </Link>
              </Button>
            </div>
            <dl className="flex w-full flex-wrap gap-x-8 gap-y-4 border-t border-border pt-6">
              {figures.map((f) => (
                <div key={f.label} className="flex flex-col-reverse">
                  <dt className="text-sm text-muted">{f.label}</dt>
                  <dd className="font-heading text-3xl font-bold tabular-nums">
                    <CountUp value={f.value} formatted={formatCount(f.value, locale)} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <section
            aria-labelledby="live-h"
            className="mx-page-enter overflow-hidden rounded-2xl border border-border bg-bg/70 backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id="live-h" className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden className="mx-live-dot inline-flex text-success">
                  <Radio className="size-4" />
                </span>
                {t('liveNow')}
              </h2>
              <Link
                href="/servers"
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                {t('seeAllServers')}
              </Link>
            </div>
            {live.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{t('liveEmpty')}</p>
            ) : (
              <ul className="mx-stagger divide-y divide-border">
                {live.map((s) => (
                  <li key={s.id} className="transition-colors hover:bg-surface-2/60">
                    <LiveServerRow
                      endpointId={s.endpointId}
                      name={s.name}
                      protocolLabel={s.protocolLabel}
                      status={s.status}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>

      {trending.items.length > 0 && (
        <section aria-labelledby="trending-h" className="mx-settle flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mx-eyebrow">{t('trendingEyebrow')}</p>
              <h2 id="trending-h" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                {t('trendingTitle')}
              </h2>
            </div>
            <Button asChild variant="ghost">
              <Link href="/explore">
                {t('exploreAll')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <ul className="mx-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {trending.items.map((c) => (
              <li key={c.id}>
                <CommunityCard c={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="features-h" className="mx-settle flex flex-col gap-6">
        <div>
          <p className="mx-eyebrow">{t('featuresEyebrow')}</p>
          <h2 id="features-h" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {t('features')}
          </h2>
        </div>
        <ul className="mx-stagger grid gap-4 md:grid-cols-6">
          {FEATURES.map((f, i) => (
            <li
              key={f.title}
              className={cn(
                'group mx-card flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-6',
                f.span,
              )}
            >
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-500 ease-[var(--mx-ease)] group-hover:scale-110 group-hover:-rotate-6"
              >
                <f.icon className="size-5" />
              </span>
              <h3 className={cn('font-semibold', i === 0 ? 'text-2xl' : 'text-lg')}>{f.title}</h3>
              <p className="text-muted">{f.body}</p>
              {i === 0 && (
                <div aria-hidden className="mt-auto flex flex-col gap-4 pt-6">
                  <div className="flex gap-2">
                    {SWATCHES.map((c, n) => (
                      <span
                        key={c}
                        className="size-8 rounded-full border-2 border-surface shadow-sm transition-transform duration-500 ease-[var(--mx-ease)] group-hover:-translate-y-1"
                        style={{ background: c, transitionDelay: `${n * 40}ms` }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="h-16 rounded-lg bg-surface-2" />
                    <span className="h-16 rounded-lg bg-surface-2" />
                    <span className="h-16 rounded-lg bg-primary/15" />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="cta-h"
        className="mx-settle relative isolate overflow-hidden rounded-3xl border border-border bg-surface px-6 py-12 sm:px-12"
      >
        <div aria-hidden className="mx-dots absolute inset-0 -z-10 rotate-180" />
        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 id="cta-h" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t('ctaTitle')}
            </h2>
            <p className="mt-2 text-muted">{t('ctaBody')}</p>
          </div>
          <Button asChild size="lg">
            <Link href={createHref}>
              {t('ctaButton')}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
