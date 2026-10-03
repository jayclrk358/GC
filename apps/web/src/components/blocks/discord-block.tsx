import { MessageCircle } from 'lucide-react';
import type { BlockConfig } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { BlockSection } from './section';

export function DiscordBlock({ id, config }: { id: string; config: BlockConfig<'discordInvite'> }) {
  return (
    <BlockSection id={id} heading={config.heading}>
      <div className="flex flex-wrap items-center gap-4 rounded-ui-lg border border-border bg-surface p-5">
        <MessageCircle className="size-8 text-primary" aria-hidden />
        <p className="flex-1 text-muted">{config.description || 'Chat with us on Discord.'}</p>
        <Button asChild>
          <a href={`https://discord.gg/${config.code}`} rel="noopener noreferrer nofollow">
            Open Discord invite
          </a>
        </Button>
      </div>
    </BlockSection>
  );
}
