import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Globe2, Play, Settings, Users } from 'lucide-react';
import { playLink, planPerks } from '@magnox/shared';
import type { LoadedCommunity } from '@/lib/community';
import { imgSources } from '@/lib/media';
import { formatCount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { PlanBadge } from '@/components/billing/plan-badge';
import { NavLink } from '@/components/shell/nav-link';
import { ScrollList } from '@/components/ui/scroll-list';
import { JoinButton } from './join-button';
import { InviteButton } from './invite-button';
import { MuteMenu } from '@/components/notifications/mute-menu';
import { isMuted } from '@magnox/core';

const TAB_PATHS: Record<string, string> = {
  home: '',
  forum: '/forum',
  chat: '/chat',
  wiki: '/wiki',
  events: '/events',
  servers: '/servers',
  members: '/members',
};

export async function CommunityHeader({ data, online }: { data: LoadedCommunity; online: number }) {
  const t = await getTranslations('community');
  const tp = await getTranslations('plans');
  const { community, game, nav, ctx, perms, user } = data;
  const theme = community.theme;
  const banner = imgSources(theme.bannerKey, 'md', '(min-width: 1600px) 1600px, 100vw');
  const icon = imgSources(theme.iconKey, 'sm', '(min-width: 640px) 96px, 80px');
  const play = playLink(community.playUrl);
  const base = `/c/${community.slug}`;
  const compact = theme.headerStyle === 'compact';
  const showMembers = community.settings.showMemberCount !== false;

  return (
    <header>
      <div className="mx-auto max-w-[100rem] px-4 pt-4 group-data-[dense=true]/dense:pt-0 sm:px-6 lg:px-8">
        {!compact && (
          <div
            className="relative h-36 overflow-hidden rounded-3xl border border-border group-data-[dense=true]/dense:hidden sm:h-56"
            data-decorative
          >
            {banner ? (
              // Lazy: chat pages hide the banner, and a hidden lazy image isn't downloaded.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...banner}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="high"
                className="mx-page-enter size-full object-cover"
                style={{ objectPosition: `50% ${theme.bannerFocalY}%` }}
              />
            ) : (
              <div
                aria-hidden
                className="size-full"
                style={{
                  background: 'linear-gradient(135deg, var(--c-primary), var(--c-accent))',
                  opacity: 0.85,
                }}
              />
            )}
          </div>
        )}
        {/* Phones: logo and buttons share the first row, the name and details get the full
            width below. Wider screens (and the dense chat header) keep everything on one row. */}
        <div
          className={
            compact
              ? 'flex flex-wrap items-center gap-x-4 gap-y-3 py-5 group-data-[dense=true]/dense:gap-3 group-data-[dense=true]/dense:py-2'
              : 'flex flex-wrap items-end gap-x-4 gap-y-3 px-2 pb-4 group-data-[dense=true]/dense:items-center group-data-[dense=true]/dense:gap-3 group-data-[dense=true]/dense:py-2 sm:px-4'
          }
        >
          {/* The logo overlaps the banner. The banner is positioned, so without its own
              stacking context here the banner would paint over the top of the logo. */}
          <div
            className={
              compact
                ? 'relative z-10'
                : 'relative z-10 -mt-7 group-data-[dense=true]/dense:mt-0 sm:-mt-12 sm:group-data-[dense=true]/dense:mt-0'
            }
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...icon}
                alt=""
                width={96}
                height={96}
                decoding="async"
                className="size-20 rounded-ui-lg border-4 border-surface bg-surface object-cover shadow-md group-data-[dense=true]/dense:size-10 group-data-[dense=true]/dense:border-2 sm:size-24 sm:group-data-[dense=true]/dense:size-10"
              />
            ) : (
              <span
                aria-hidden
                className="grid size-20 place-items-center rounded-ui-lg border-4 border-surface bg-primary font-heading text-3xl font-extrabold text-on-primary shadow-md group-data-[dense=true]/dense:size-10 group-data-[dense=true]/dense:border-2 group-data-[dense=true]/dense:text-lg sm:size-24 sm:group-data-[dense=true]/dense:size-10"
              >
                {community.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="order-last flex min-w-0 basis-full flex-col gap-1 group-data-[dense=true]/dense:order-none group-data-[dense=true]/dense:flex-1 group-data-[dense=true]/dense:basis-0 group-data-[dense=true]/dense:gap-0 sm:order-none sm:flex-1 sm:basis-0 sm:pt-2 sm:group-data-[dense=true]/dense:pt-0">
            <h1 className="text-2xl font-extrabold break-words group-data-[dense=true]/dense:truncate group-data-[dense=true]/dense:text-lg sm:text-3xl sm:group-data-[dense=true]/dense:text-lg">
              {community.name}
            </h1>
            {community.tagline && (
              <p className="text-muted group-data-[dense=true]/dense:hidden">{community.tagline}</p>
            )}
            <ul
              className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted group-data-[dense=true]/dense:sr-only"
              aria-label={t('details')}
            >
              {planPerks(community.plan).badge && (
                <li>
                  <PlanBadge plan={community.plan} label={tp(`names.${community.plan}`)} />
                </li>
              )}
              {game && (
                <li>
                  <Badge tone="primary">{game.name}</Badge>
                </li>
              )}
              {showMembers && (
                <li className="flex items-center gap-1 whitespace-nowrap">
                  <Users className="size-4" aria-hidden />
                  {t('memberCount', {
                    count: community.memberCount,
                    formatted: formatCount(community.memberCount),
                  })}
                </li>
              )}
              <li className="flex items-center gap-1 whitespace-nowrap">
                <span aria-hidden className="inline-block size-2 rounded-full bg-success" />
                {t('onlineCount', { count: online })}
              </li>
              {community.region !== 'global' && (
                <li className="flex items-center gap-1 whitespace-nowrap">
                  <Globe2 className="size-4" aria-hidden />
                  {t(`regions.${community.region}`)}
                </li>
              )}
              {community.visibility !== 'public' && (
                <li>
                  <Badge>{t(`visibility.${community.visibility}`)}</Badge>
                </li>
              )}
            </ul>
          </div>
          <div className="ms-auto flex flex-wrap items-center justify-end gap-2 pb-1 group-data-[dense=true]/dense:pb-0 sm:ms-0">
            {play && (
              <Button asChild variant="play" className="mx-press">
                <a
                  href={play.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={play.host}
                  aria-label={
                    play.platform === 'roblox'
                      ? t('playOnRoblox')
                      : t('playOnSite', { host: play.host })
                  }
                >
                  <Play aria-hidden className="fill-current" /> {t('play')}
                </a>
              </Button>
            )}
            <JoinButton
              communityId={community.id}
              signedIn={Boolean(user)}
              isMember={ctx.isMember}
              isOwner={ctx.isOwner}
              joinMode={community.joinMode}
              visibility={community.visibility}
            />
            {perms.createInvite && <InviteButton communityId={community.id} />}
            {user && ctx.isMember && (
              <MuteMenu
                targetType="community"
                targetId={community.id}
                name={community.name}
                muted={await isMuted(user.id, 'community', community.id)}
                iconOnly
              />
            )}
            {perms.settings && (
              <Button asChild variant="outline" size="icon" aria-label={t('settings')}>
                <Link href={`${base}/settings`}>
                  <Settings aria-hidden />
                </Link>
              </Button>
            )}
          </div>
        </div>
        <nav
          aria-label={t('sections', { name: community.name })}
          className="border-b border-border"
        >
          <ScrollList className="relative flex gap-1 overflow-x-auto">
            {nav.map((item) => (
              <li key={item.tab}>
                <NavLink
                  href={`${base}${TAB_PATHS[item.tab]}`}
                  exact={item.tab === 'home'}
                  also={item.tab === 'forum' ? [`${base}/t`] : undefined}
                  className="relative rounded-none rounded-t-ui-sm px-4 py-2.5 transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-[var(--mx-ease)] hover:bg-transparent hover:after:scale-x-50 aria-[current=page]:bg-transparent aria-[current=page]:after:scale-x-100"
                >
                  {item.label || t(`tabs.${item.tab}`)}
                </NavLink>
              </li>
            ))}
          </ScrollList>
        </nav>
      </div>
    </header>
  );
}
