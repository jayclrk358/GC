import {
  AtSign,
  Code2,
  Gamepad2,
  Globe,
  Heart,
  Link as LinkIcon,
  MessageCircle,
  MessagesSquare,
  PlayCircle,
  Radio,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import type { BlockConfig } from '@magnox/shared';
import { BlockSection } from './section';

const ICONS: Record<string, LucideIcon> = {
  website: Globe,
  discord: MessageCircle,
  steam: Gamepad2,
  youtube: PlayCircle,
  twitch: Radio,
  x: AtSign,
  bluesky: AtSign,
  reddit: MessagesSquare,
  github: Code2,
  tiktok: PlayCircle,
  instagram: AtSign,
  patreon: Heart,
  store: ShoppingBag,
  other: LinkIcon,
};

export function LinksBlock({ id, config }: { id: string; config: BlockConfig<'links'> }) {
  if (!config.links.length) return null;
  return (
    <BlockSection id={id} heading={config.heading}>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {config.links.map((l, i) => {
          const Icon = ICONS[l.kind] ?? LinkIcon;
          return (
            <li key={i}>
              <a
                href={l.url}
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-3 rounded-ui border border-border bg-surface p-3 font-semibold hover:border-primary"
              >
                <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{l.label}</span>
                <span className="ms-auto truncate text-xs font-normal text-muted">{new URL(l.url).hostname}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </BlockSection>
  );
}
