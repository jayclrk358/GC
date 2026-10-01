import type { Block } from '@magnox/shared';
import type { LoadedCommunity } from '@/lib/community';
import { AboutBlock } from './about-block';
import { DiscordBlock } from './discord-block';
import { EmbedBlock } from './embed-block';
import { FaqBlock } from './faq-block';
import { FeaturedThreadsBlock } from './featured-threads-block';
import { GalleryBlock } from './gallery-block';
import { HeroBlock } from './hero-block';
import { LinksBlock } from './links-block';
import { RulesBlock } from './rules-block';
import { ServerStatusBlock } from './server-status-block';
import { StaffBlock } from './staff-block';
import { StatsBlock } from './stats-block';
import { UpcomingEventsBlock } from './upcoming-events-block';

export function renderBlock(block: Block, data: LoadedCommunity) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock id={block.id} config={block.config} data={data} />;
    case 'about':
    case 'richText':
      return <AboutBlock id={block.id} config={block.config} />;
    case 'rules':
      return <RulesBlock id={block.id} config={block.config} />;
    case 'links':
      return <LinksBlock id={block.id} config={block.config} />;
    case 'faq':
      return <FaqBlock id={block.id} config={block.config} />;
    case 'gallery':
      return <GalleryBlock id={block.id} config={block.config} />;
    case 'staff':
      return <StaffBlock id={block.id} config={block.config} data={data} />;
    case 'discordInvite':
      return <DiscordBlock id={block.id} config={block.config} />;
    case 'embed':
      return <EmbedBlock id={block.id} config={block.config} />;
    case 'serverStatus':
      return <ServerStatusBlock id={block.id} config={block.config} data={data} />;
    case 'stats':
      return <StatsBlock id={block.id} config={block.config} data={data} />;
    case 'featuredThreads':
      return <FeaturedThreadsBlock id={block.id} config={block.config} data={data} />;
    case 'upcomingEvents':
      return <UpcomingEventsBlock id={block.id} config={block.config} data={data} />;
    default:
      return null;
  }
}

/** The community landing page: blocks in order, each its own labelled region. */
export function BlockList({ blocks, data }: { blocks: Block[]; data: LoadedCommunity }) {
  return (
    <div className="flex flex-col gap-10">
      {blocks.map((b) => (
        <div key={b.id} data-block={b.type}>
          {renderBlock(b, data)}
        </div>
      ))}
    </div>
  );
}
