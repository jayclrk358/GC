'use client';

import * as React from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { HoverCard } from 'radix-ui';
import { Crown, Gamepad2, Users } from 'lucide-react';
import type { ProfileCard } from '@gamecentral/core';
import { RoleBadge } from '@/components/community/role-badge';
import { StyledName } from '@/components/community/role-decor';
import { usePrefs } from '@/components/shell/prefs-provider';
import { Avatar, Badge } from '@/components/ui/misc';
import { StaffBadge } from '@/components/profile/staff-badge';
import { imgSourcesFromUrl } from '@/lib/media';

// One request per person (and community) per page; a failed one is retried next time.
const cards = new Map<string, Promise<ProfileCard | null>>();

function loadCard(username: string, communityId?: string): Promise<ProfileCard | null> {
  const key = `${username}|${communityId ?? ''}`;
  let card = cards.get(key);
  if (!card) {
    const qs = communityId ? `?community=${encodeURIComponent(communityId)}` : '';
    card = fetch(`/api/users/${encodeURIComponent(username)}/card${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<ProfileCard>) : null))
      .catch(() => {
        cards.delete(key);
        return null;
      });
    cards.set(key, card);
  }
  return card;
}

/**
 * A link to someone's profile that shows a slice of it (banner, status, roles here, bio) when
 * hovered or focused. Touch opens the profile page as a normal link.
 */
export function UserLink({
  username,
  communityId,
  className,
  children,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof Link>, 'href'> & {
  username: string;
  /** Adds their roles and join date in this community to the card. */
  communityId?: string;
}) {
  const [card, setCard] = React.useState<ProfileCard | null | undefined>(undefined);
  const load = () => {
    if (card === undefined) void loadCard(username, communityId).then(setCard);
  };
  // Start loading once the pointer rests on the name (so the card is usually ready when it
  // opens), but not for every name the pointer merely crosses.
  const rest = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(rest.current), []);
  return (
    <HoverCard.Root openDelay={350} closeDelay={150} onOpenChange={(open) => open && load()}>
      <HoverCard.Trigger asChild>
        <Link
          href={`/u/${username}`}
          className={className}
          // Chats and member lists show dozens of names; don't prefetch every profile.
          prefetch={false}
          onPointerEnter={() => {
            clearTimeout(rest.current);
            rest.current = setTimeout(load, 150);
          }}
          onPointerLeave={() => clearTimeout(rest.current)}
          {...props}
        >
          {children}
        </Link>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="mx-pop z-50 w-72 overflow-hidden rounded-ui-lg border border-border bg-surface text-fg shadow-xl"
        >
          {card === undefined ? (
            <CardSkeleton />
          ) : card === null ? (
            <Unavailable />
          ) : (
            <CardBody card={card} />
          )}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function CardSkeleton() {
  const t = useTranslations('profileCard');
  return (
    <div role="status" className="flex flex-col">
      <span className="sr-only">{t('loading')}</span>
      <div className="h-16 animate-pulse bg-surface-2 motion-reduce:animate-none" />
      <div className="flex flex-col gap-2 p-4 pt-10">
        <div className="h-4 w-32 rounded bg-surface-2" />
        <div className="h-3 w-20 rounded bg-surface-2" />
      </div>
    </div>
  );
}

function Unavailable() {
  const t = useTranslations('profileCard');
  return <p className="p-4 text-sm text-muted">{t('unavailable')}</p>;
}

function CardBody({ card }: { card: ProfileCard }) {
  const t = useTranslations('profileCard');
  const format = useFormatter();
  const { prefs } = usePrefs();
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  const member = card.member;
  const displayName = member?.nickname || card.name;
  const banner = imgSourcesFromUrl(card.bannerUrl, 'md');
  return (
    <div className="flex flex-col">
      <div className="h-16" aria-hidden>
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...banner} alt="" decoding="async" className="size-full object-cover" />
        ) : (
          <div
            className="size-full"
            style={{
              background: `linear-gradient(135deg, ${card.accentColor ?? 'var(--c-primary)'}, var(--c-accent))`,
            }}
          />
        )}
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {/* Positioned so it draws over the banner it overlaps. */}
        <div className="relative -mt-8 w-fit rounded-full bg-surface">
          <Avatar
            src={card.image}
            name={card.name}
            size={64}
            className="border-4 border-surface"
            presence={card.id}
          />
        </div>
        <div className="-mt-1 min-w-0">
          <p className="flex items-center gap-1.5 truncate text-lg leading-tight font-bold">
            <StyledName name={displayName} style={member?.nameStyle} />
            {member?.owner && (
              <Crown className="size-4 shrink-0 text-warning" aria-label={t('owner')} role="img" />
            )}
          </p>
          <p className="truncate text-sm text-muted">
            @{card.username}
            {displayName !== card.name && <span> · {card.name}</span>}
            {card.pronouns && <span> · {card.pronouns}</span>}
          </p>
        </div>
        {card.status && (
          <p className="rounded-ui border border-border bg-surface-2 px-2.5 py-1.5 text-sm">
            {card.status}
          </p>
        )}
        {(card.staffRole || card.nowPlaying || card.lookingForGroup) && (
          <p className="flex flex-wrap gap-1.5">
            {card.staffRole && <StaffBadge role={card.staffRole} />}
            {card.nowPlaying && (
              <Badge tone="primary">
                <Gamepad2 aria-hidden className="size-3.5" />
                {t('playing', { game: card.nowPlaying })}
              </Badge>
            )}
            {card.lookingForGroup && (
              <Badge tone="success">
                <Users aria-hidden className="size-3.5" />
                {t('lookingForGroup')}
              </Badge>
            )}
          </p>
        )}
        {card.bio && <p className="line-clamp-3 text-sm whitespace-pre-line">{card.bio}</p>}
        {member && member.roles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-bold tracking-wide text-muted uppercase">{t('roles')}</p>
            <ul
              className="flex flex-wrap gap-1"
              aria-label={t('rolesIn', { community: member.community })}
            >
              {member.roles.map((r) => (
                <li key={r.name}>
                  <RoleBadge
                    name={r.name}
                    color={r.color}
                    iconUrl={r.iconUrl}
                    colorblind={prefs.colorblindRoleColors}
                    style={r.style}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="grid gap-0.5 text-xs text-muted">
          {member && (
            <div className="flex gap-1">
              <dt>{t('memberSince', { community: member.community })}</dt>
              <dd className="font-semibold text-fg">{date(member.joinedAt)}</dd>
            </div>
          )}
          <div className="flex gap-1">
            <dt>{t('joined')}</dt>
            <dd className="font-semibold text-fg">{date(card.joinedAt)}</dd>
          </div>
        </dl>
        <Link
          href={`/u/${card.username}`}
          className="rounded-ui border border-border px-3 py-1.5 text-center text-sm font-semibold hover:bg-surface-2"
        >
          {t('viewProfile')}
        </Link>
      </div>
    </div>
  );
}
