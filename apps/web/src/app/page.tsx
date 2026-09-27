import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
} from 'lucide-react';
import { exploreCommunities, listPublicServers, platformStats } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { CommunityCard } from '@/components/community/community-card';
import { LiveServerRow } from '@/components/servers/live-server-row';
import { getUser } from '@/lib/auth';
import { formatCount } from '@/lib/utils';

const FEATURES = [
  {
    icon: Palette,
    title: 'Make it yours',
    body: 'Themes, fonts, banners and a drag-and-drop page builder. Every theme is contrast-checked.',
  },
  {
    icon: Server,
    title: 'Live server status',
    body: 'Link Minecraft, Rust, CS2, FiveM and more. Player counts update in real time.',
  },
  {
    icon: MessagesSquare,
    title: 'Forum + chat',
    body: 'Searchable discussions that last, and real-time chat channels when you need them.',
  },
  {
    icon: CalendarDays,
    title: 'Events & wiki',
    body: 'Schedule game nights across time zones and build a knowledge base together.',
  },
  {
    icon: LayoutTemplate,
    title: 'Roles & permissions',
    body: 'Fine-grained roles, channel overrides, invites, applications and moderation tools.',
  },
  {
    icon: Accessibility,
    title: 'Accessible by default',
    body: 'High contrast, dyslexia-friendly fonts, reduced motion, screen reader support and full keyboard control.',
  },
];

export default async function HomePage() {
  const t = await getTranslations('home');
  const [user, stats, live, trending] = await Promise.all([
    getUser(),
    platformStats(),
    listPublicServers({ limit: 5 }),
    exploreCommunities({ pageSize: 6 }),
  ]);
  const createHref = user ? '/new' : '/sign-up?next=/new';
  const tiles = [
    { label: t('statCommunities'), value: stats.communities },
    { label: t('statServers'), value: stats.serversOnline },
    { label: t('statPlayers'), value: stats.players },
  ];

  return (
    <div className="flex flex-col">
      <section
        aria-labelledby="hero-h"
        className="relative isolate overflow-hidden border-b border-border"
      >
        <div aria-hidden className="mx-grid-bg absolute inset-0 -z-10" />
        <div aria-hidden className="mx-glow-blob -top-24 -left-24 -z-10 size-96 bg-primary" />
        <div aria-hidden className="mx-glow-blob top-32 -right-24 -z-10 size-80 bg-accent" />

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.25fr_1fr]">
          <div className="flex flex-col items-start gap-6">
            <p className="mx-eyebrow flex items-center gap-2">
              <Gamepad2 className="size-4" aria-hidden />
              {t('eyebrow')}
            </p>
            <h1
              id="hero-h"
              className="text-5xl leading-[1.05] font-extrabold tracking-tight uppercase sm:text-7xl"
            >
              {t.rich('heroTitle', {
                hl: (chunks) => <span className="block text-primary">{chunks}</span>,
              })}
            </h1>
            <p className="max-w-xl text-lg text-muted">{t('heroBody')}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={createHref}>{t('getStarted')}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/servers">
                  <Server aria-hidden />
                  {t('findServers')}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/explore">{t('explore')}</Link>
              </Button>
            </div>
            <dl className="grid w-full max-w-xl grid-cols-3 gap-2 pt-2 max-[359px]:grid-cols-1 sm:gap-3">
              {tiles.map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col-reverse justify-end gap-1 rounded-ui border border-border bg-surface/80 px-3 py-3 backdrop-blur sm:px-4"
                >
                  <dt className="text-[0.6875rem] font-semibold text-muted uppercase sm:text-xs sm:tracking-wider">
                    {s.label}
                  </dt>
                  <dd className="font-heading text-2xl font-bold sm:text-3xl">
                    {formatCount(s.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <section
            aria-labelledby="live-h"
            className="overflow-hidden rounded-ui-lg border border-border bg-surface/90 shadow-[0_24px_60px_-30px_var(--c-primary)] backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id="live-h" className="flex items-center gap-2 text-sm font-bold uppercase">
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
              <ul className="divide-y divide-border">
                {live.map((s) => (
                  <li key={s.id}>
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
        <section aria-labelledby="trending-h" className="mx-auto w-full max-w-6xl px-4 pt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mx-eyebrow">{t('trendingEyebrow')}</p>
              <h2 id="trending-h" className="mt-1 text-3xl font-bold uppercase">
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
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trending.items.map((c) => (
              <li key={c.id}>
                <CommunityCard c={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="features-h" className="mx-auto w-full max-w-6xl px-4 py-16">
        <p className="mx-eyebrow">{t('featuresEyebrow')}</p>
        <h2 id="features-h" className="mt-1 text-3xl font-bold uppercase">
          {t('features')}
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="mx-card-glow rounded-ui-lg border border-border bg-surface p-5"
            >
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-ui text-on-primary"
                style={{ background: 'linear-gradient(135deg, var(--c-primary), var(--c-accent))' }}
              >
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-bold">{f.title}</h3>
              <p className="mt-1 text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cta-h" className="mx-auto w-full max-w-6xl px-4 pb-20">
        <div className="relative isolate overflow-hidden rounded-ui-lg border border-border bg-surface px-6 py-12 sm:px-12">
          <div aria-hidden className="mx-grid-bg absolute inset-0 -z-10" />
          <div aria-hidden className="mx-glow-blob -right-16 -bottom-24 -z-10 size-72 bg-primary" />
          <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 id="cta-h" className="text-3xl font-bold uppercase">
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
        </div>
      </section>
    </div>
  );
}
