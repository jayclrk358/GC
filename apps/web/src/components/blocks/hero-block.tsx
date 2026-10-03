import Link from 'next/link';
import type { BlockConfig } from '@gamecentral/shared';
import type { LoadedCommunity } from '@/lib/community';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { JoinButton } from '@/components/community/join-button';

const TARGETS: Record<string, string> = {
  forum: '/forum',
  chat: '/chat',
  servers: '/servers',
  events: '/events',
};

export function HeroBlock({
  id,
  config,
  data,
}: {
  id: string;
  config: BlockConfig<'hero'>;
  data: LoadedCommunity;
}) {
  const { community, ctx, user } = data;
  const centered = config.align === 'center';
  let cta: React.ReactNode = null;
  if (config.ctaLabel) {
    if (config.ctaTarget === 'join') {
      cta = ctx.isMember ? null : (
        <JoinButton
          communityId={community.id}
          slug={community.slug}
          signedIn={Boolean(user)}
          isMember={ctx.isMember}
          isOwner={ctx.isOwner}
          joinMode={community.joinMode}
          visibility={community.visibility}
          archived={Boolean(community.archivedAt)}
          size="lg"
          label={config.ctaLabel}
        />
      );
    } else if (config.ctaTarget === 'url' && config.ctaUrl) {
      cta = (
        <Button asChild size="lg">
          <a href={config.ctaUrl} rel="noopener noreferrer nofollow">
            {config.ctaLabel}
          </a>
        </Button>
      );
    } else if (TARGETS[config.ctaTarget]) {
      cta = (
        <Button asChild size="lg">
          <Link href={`/c/${community.slug}${TARGETS[config.ctaTarget]}`}>{config.ctaLabel}</Link>
        </Button>
      );
    }
  }
  return (
    <section
      aria-labelledby={`b-${id}-h`}
      className={cn(
        'flex flex-col gap-4 rounded-ui-lg border border-border bg-surface p-6 sm:p-10',
        centered ? 'items-center text-center' : 'items-start',
      )}
    >
      <h2 id={`b-${id}-h`} className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
        {config.heading}
      </h2>
      {config.subheading && <p className="max-w-2xl text-lg text-muted">{config.subheading}</p>}
      {cta}
    </section>
  );
}
