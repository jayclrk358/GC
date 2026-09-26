import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CalendarDays, Link as LinkIcon, MapPin } from 'lucide-react';
import { getPublicProfile } from '@magnox/core';
import { formatDate } from '@/lib/format';
import { Avatar, Badge } from '@/components/ui/misc';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const profile = await getPublicProfile((await params).username);
  return { title: profile ? `${profile.name} (@${profile.username})` : 'Profile' };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const profile = await getPublicProfile((await params).username);
  if (!profile) notFound();
  const t = await getTranslations('profile');
  return (
    <div className="flex flex-col">
      <div className="h-40 sm:h-56" data-decorative aria-hidden>
        {profile.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.bannerUrl} alt="" className="size-full object-cover" />
        ) : (
          <div
            className="size-full"
            style={{
              background: `linear-gradient(135deg, ${profile.accentColor ?? 'var(--c-primary)'}, var(--c-accent))`,
            }}
          />
        )}
      </div>
      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="-mt-12 flex flex-wrap items-end gap-4">
          <Avatar
            src={profile.image}
            name={profile.name}
            size={112}
            className="border-4 border-bg"
          />
          <div className="pb-2">
            <h1 className="text-3xl font-extrabold">{profile.name}</h1>
            <p className="text-muted">
              @{profile.username}
              {profile.pronouns && <span> · {profile.pronouns}</span>}
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-8 md:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            {profile.bio && <p className="text-lg whitespace-pre-line">{profile.bio}</p>}
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
                        className="flex items-center gap-3 rounded-ui border border-border bg-surface p-3 hover:border-primary"
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
          </div>
          <aside className="flex flex-col gap-4" aria-label={t('details')}>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              {profile.location && (
                <li className="flex items-center gap-2">
                  <MapPin className="size-4" aria-hidden /> {profile.location}
                </li>
              )}
              <li className="flex items-center gap-2">
                <CalendarDays className="size-4" aria-hidden />{' '}
                {t('joined', { date: formatDate(profile.createdAt) })}
              </li>
            </ul>
            {profile.links.length > 0 && (
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
            )}
            {profile.games.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-bold">{t('favoriteGames')}</h2>
                <ul className="flex flex-wrap gap-1">
                  {profile.games.map((g) => (
                    <li key={g.id}>
                      <Badge>{g.name}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
