import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Globe2, Settings, Users } from 'lucide-react';
import type { LoadedCommunity } from '@/lib/community';
import { mediaUrl } from '@/lib/media';
import { formatCount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { NavLink } from '@/components/shell/nav-link';
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
  const { community, game, nav, ctx, perms, user } = data;
  const theme = community.theme;
  const banner = mediaUrl(theme.bannerKey);
  const icon = mediaUrl(theme.iconKey);
  const base = `/c/${community.slug}`;
  const compact = theme.headerStyle === 'compact';
  const showMembers = community.settings.showMemberCount !== false;

  return (
    <header>
      <div className="mx-auto max-w-6xl px-4 pt-4 group-data-[dense=true]/dense:max-w-7xl group-data-[dense=true]/dense:pt-0 sm:px-6 lg:px-8">
        {!compact && (
          <div
            className="relative h-36 overflow-hidden rounded-3xl border border-border group-data-[dense=true]/dense:hidden sm:h-56"
            data-decorative
          >
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={banner}
                alt=""
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
        <div
          className={
            compact
              ? 'flex flex-wrap items-center gap-4 py-5 group-data-[dense=true]/dense:gap-3 group-data-[dense=true]/dense:py-2'
              : 'flex flex-wrap items-end gap-4 px-2 pb-4 group-data-[dense=true]/dense:items-center group-data-[dense=true]/dense:gap-3 group-data-[dense=true]/dense:py-2 sm:px-4'
          }
        >
          {/* The logo overlaps the banner. The banner is positioned, so without its own
              stacking context here the banner would paint over the top of the logo. */}
          <div
            className={
              compact
                ? 'relative z-10'
                : 'relative z-10 -mt-10 group-data-[dense=true]/dense:mt-0 sm:-mt-12 sm:group-data-[dense=true]/dense:mt-0'
            }
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={icon}
                alt=""
                width={96}
                height={96}
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
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2 group-data-[dense=true]/dense:gap-0 group-data-[dense=true]/dense:pt-0">
            <h1 className="text-2xl font-extrabold group-data-[dense=true]/dense:text-lg sm:text-3xl sm:group-data-[dense=true]/dense:text-lg">
              {community.name}
            </h1>
            {community.tagline && (
              <p className="text-muted group-data-[dense=true]/dense:hidden">{community.tagline}</p>
            )}
            <ul
              className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted group-data-[dense=true]/dense:sr-only"
              aria-label={t('details')}
            >
              {game && (
                <li>
                  <Badge tone="primary">{game.name}</Badge>
                </li>
              )}
              {showMembers && (
                <li className="flex items-center gap-1">
                  <Users className="size-4" aria-hidden />
                  {t('memberCount', {
                    count: community.memberCount,
                    formatted: formatCount(community.memberCount),
                  })}
                </li>
              )}
              <li className="flex items-center gap-1">
                <span aria-hidden className="inline-block size-2 rounded-full bg-success" />
                {t('onlineCount', { count: online })}
              </li>
              {community.region !== 'global' && (
                <li className="flex items-center gap-1">
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
          <div className="flex flex-wrap items-center gap-2 pb-1">
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
          className="overflow-x-auto border-b border-border"
        >
          <ul className="flex gap-1">
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
          </ul>
        </nav>
      </div>
    </header>
  );
}
