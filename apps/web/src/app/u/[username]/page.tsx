import { cache } from 'react';
import * as React from 'react';
import Link from '@/components/ui/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  CalendarDays,
  Clock,
  Gamepad2,
  Glasses,
  Languages,
  Link as LinkIcon,
  MapPin,
  Monitor,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { getPublicProfile, hasBlocked } from '@gamecentral/core';
import { ACCOUNT_KINDS, type Platform } from '@gamecentral/shared';
import { getUser } from '@/lib/auth';
import { BlockButton } from '@/components/moderation/block-button';
import { CopyHandle, LocalTime } from '@/components/profile/profile-client';
import { StaffBadge } from '@/components/profile/staff-badge';
import { formatDate } from '@/lib/format';
import { Avatar, Badge } from '@/components/ui/misc';
import { HistoryBack } from '@/components/ui/history-back';
import { imgSourcesFromUrl } from '@/lib/media';

const PLATFORM_ICONS: Record<Platform, LucideIcon> = {
  pc: Monitor,
  playstation: Gamepad2,
  xbox: Gamepad2,
  switch: Gamepad2,
  mobile: Smartphone,
  vr: Glasses,
};

const KINDS = new Map(ACCOUNT_KINDS.map((k) => [k.key, k]));

// Once per request: the title (generateMetadata) and the page share it.
const loadProfile = cache(async (username: string) => {
  const viewer = await getUser();
  return { viewer, profile: await getPublicProfile(username, viewer?.id) };
});

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { profile } = await loadProfile((await params).username);
  return { title: profile ? `${profile.name} (@${profile.username})` : 'Profile' };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-sm font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { viewer, profile } = await loadProfile((await params).username);
  if (!profile) notFound();
  const banner = imgSourcesFromUrl(profile.bannerUrl, 'md', '100vw');
  const t = await getTranslations('profile');
  const tc = await getTranslations('community');
  const locale = await getLocale();
  const blocked =
    viewer && viewer.id !== profile.id ? await hasBlocked(viewer.id, profile.id) : false;
  const stats = [
    { value: profile.stats.threads, label: t('statThreads', { count: profile.stats.threads }) },
    { value: profile.stats.replies, label: t('statReplies', { count: profile.stats.replies }) },
    {
      value: profile.stats.communities,
      label: t('statCommunities', { count: profile.stats.communities }),
    },
  ];
  return (
    <div className="flex flex-col pb-12">
      <div className="relative">
        <HistoryBack
          fallback="/"
          className="absolute start-4 top-4 z-10 rounded-full bg-surface/90 px-3 text-fg shadow-sm backdrop-blur"
        />
        <div className="h-40 sm:h-56" data-decorative aria-hidden>
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...banner} alt="" decoding="async" className="size-full object-cover" />
          ) : (
            <div
              className="size-full"
              style={{
                background: `linear-gradient(135deg, ${profile.accentColor ?? 'var(--c-primary)'}, var(--c-accent))`,
              }}
            />
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-5xl px-4">
        {/* Positioned (like the banner above it) so the avatar draws over the banner. */}
        <div className="relative -mt-12 flex flex-wrap items-end gap-4">
          <div className="shrink-0 rounded-full bg-bg" data-profile-avatar>
            <Avatar
              src={profile.image}
              name={profile.name}
              size={112}
              className="border-4 border-bg"
              presence={profile.id}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1 pb-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-extrabold">{profile.name}</h1>
              {profile.staffRole && (
                <StaffBadge role={profile.staffRole} className="py-1 text-sm" />
              )}
            </div>
            <p className="text-muted">
              @{profile.username}
              {profile.pronouns && <span> · {profile.pronouns}</span>}
            </p>
          </div>
          {viewer && viewer.id !== profile.id && (
            <div className="ms-auto pb-2">
              <BlockButton userId={profile.id} name={profile.name} blocked={blocked} />
            </div>
          )}
        </div>

        {(profile.status || profile.lookingForGroup || profile.nowPlaying) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {profile.status && (
              <p className="rounded-ui border border-border bg-surface px-3 py-1.5 text-sm">
                {profile.status}
              </p>
            )}
            {profile.nowPlaying && (
              <Badge tone="primary" className="py-1 text-sm">
                <Gamepad2 aria-hidden className="size-4" />
                {t('nowPlaying')}: {profile.nowPlaying.name}
              </Badge>
            )}
            {profile.lookingForGroup && (
              <Badge tone="success" className="py-1 text-sm">
                <Users aria-hidden className="size-4" />
                {t('lookingForGroup')}
              </Badge>
            )}
          </div>
        )}

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-8">
            {profile.bio && <p className="text-lg whitespace-pre-line">{profile.bio}</p>}

            <section aria-labelledby="stats-h">
              <h2 id="stats-h" className="sr-only">
                {t('stats')}
              </h2>
              <dl className="grid grid-cols-3 gap-3">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="flex flex-col-reverse rounded-ui-lg border border-border bg-surface p-4"
                  >
                    <dt className="text-sm text-muted">{s.label}</dt>
                    <dd className="font-heading text-2xl font-bold">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="communities-h">
              <h2 id="communities-h" className="mb-3 text-lg font-bold">
                {t('communities')}
              </h2>
              {profile.communities.length === 0 ? (
                <p className="text-muted">{t('noCommunities')}</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {profile.communities.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/c/${c.slug}`}
                        className="mx-press flex items-center gap-3 rounded-ui border border-border bg-surface p-3 hover:border-primary"
                      >
                        <span
                          aria-hidden
                          className="grid size-9 place-items-center rounded-ui font-bold"
                          style={{
                            background: c.theme.light.primary,
                            color: c.theme.light.onPrimary,
                          }}
                        >
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{c.name}</span>
                          {c.ownerId === profile.id && (
                            <span className="text-xs text-muted">{t('owner')}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {profile.shared.length > 0 && (
              <section aria-labelledby="shared-h">
                <h2 id="shared-h" className="mb-3 text-lg font-bold">
                  {t('sharedCommunities')}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {profile.shared.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/c/${c.slug}`}
                        className="mx-press inline-flex rounded-full border border-border bg-surface px-3 py-1 text-sm font-semibold hover:border-primary"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-6" aria-label={t('details')}>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              {profile.location && (
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0" aria-hidden /> {profile.location}
                </li>
              )}
              {profile.timezone && (
                <li className="flex items-center gap-2">
                  <Clock className="size-4 shrink-0" aria-hidden />
                  <LocalTime timeZone={profile.timezone} />
                </li>
              )}
              {profile.languages.length > 0 && (
                <li className="flex items-center gap-2">
                  <Languages className="size-4 shrink-0" aria-hidden />
                  <span>
                    {t('speaks')}{' '}
                    {profile.languages.map((l, i) => (
                      <React.Fragment key={l}>
                        {i > 0 && ', '}
                        <span lang={l}>{tc(`languages.${l}`)}</span>
                      </React.Fragment>
                    ))}
                  </span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0" aria-hidden />
                {t('joined', { date: formatDate(profile.createdAt, locale) })}
              </li>
            </ul>

            {profile.platforms.length > 0 && (
              <Section id="platforms-h" title={t('playsOn')}>
                <ul className="flex flex-wrap gap-1.5">
                  {profile.platforms.map((p) => {
                    const Icon = PLATFORM_ICONS[p as Platform] ?? Gamepad2;
                    return (
                      <li key={p}>
                        <Badge>
                          <Icon aria-hidden className="size-3.5" />
                          {t(`platformOptions.${p}`)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {profile.playstyles.length > 0 && (
              <Section id="playstyles-h" title={t('playstyles')}>
                <ul className="flex flex-wrap gap-1.5">
                  {profile.playstyles.map((p) => (
                    <li key={p}>
                      <Badge tone="accent">{t(`playstyleOptions.${p}`)}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {profile.accounts.length > 0 && (
              <Section id="accounts-h" title={t('accounts')}>
                <dl className="flex flex-col gap-1.5 text-sm">
                  {profile.accounts.map((a) => {
                    const kind = KINDS.get(a.key)!;
                    const url = kind.url?.(a.handle);
                    return (
                      <div key={a.key} className="flex items-center justify-between gap-3">
                        <dt className="shrink-0 text-muted">{kind.label}</dt>
                        <dd className="min-w-0">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="block truncate font-mono text-primary underline underline-offset-2"
                            >
                              {a.handle}
                              <span className="sr-only"> {t('opensNewTab')}</span>
                            </a>
                          ) : (
                            <CopyHandle service={kind.label} handle={a.handle} />
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </Section>
            )}

            {profile.links.length > 0 && (
              <Section id="links-h" title={t('links')}>
                <ul className="flex flex-col gap-1">
                  {profile.links.map((l, i) => (
                    <li key={i}>
                      <a
                        href={l.url}
                        rel="noopener noreferrer nofollow me"
                        className="flex items-center gap-2 text-primary underline"
                      >
                        <LinkIcon className="size-4" aria-hidden /> {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {profile.games.length > 0 && (
              <Section id="games-h" title={t('favoriteGames')}>
                <ul className="flex flex-wrap gap-1">
                  {profile.games.map((g) => (
                    <li key={g.id}>
                      <Badge>{g.name}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
