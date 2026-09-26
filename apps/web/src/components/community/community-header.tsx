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
    <header className="border-b border-border bg-surface">
      {!compact && (
        <div className="relative h-36 overflow-hidden sm:h-52" data-decorative>
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner}
              alt=""
              className="size-full object-cover"
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
      <div className="mx-auto max-w-6xl px-4">
        <div
          className={
            compact
              ? 'flex flex-wrap items-center gap-4 py-5'
              : 'flex flex-wrap items-end gap-4 pb-4'
          }
        >
          <div className={compact ? '' : '-mt-10 sm:-mt-12'}>
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={icon}
                alt=""
                width={96}
                height={96}
                className="size-20 rounded-ui-lg border-4 border-surface bg-surface object-cover sm:size-24"
              />
            ) : (
              <span
                aria-hidden
                className="grid size-20 place-items-center rounded-ui-lg border-4 border-surface bg-primary font-heading text-3xl font-extrabold text-on-primary sm:size-24"
              >
                {community.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{community.name}</h1>
            {community.tagline && <p className="text-muted">{community.tagline}</p>}
            <ul
              className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted"
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
          className="-mb-px overflow-x-auto"
        >
          <ul className="flex gap-1">
            {nav.map((item) => (
              <li key={item.tab}>
                <NavLink
                  href={`${base}${TAB_PATHS[item.tab]}`}
                  exact={item.tab === 'home'}
                  className="rounded-none rounded-t-ui-sm border-b-2 border-transparent px-4 py-2.5 aria-[current=page]:border-primary aria-[current=page]:bg-transparent"
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
