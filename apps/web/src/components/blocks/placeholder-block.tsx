import type { LoadedCommunity } from '@/lib/community';
import { BlockSection } from './section';

const TEXT: Record<string, string> = {
  featuredThreads: 'Latest forum threads will appear here once the forum is set up.',
  upcomingEvents: 'Upcoming events will appear here once you schedule some.',
};

/** Blocks for features that aren't set up yet: only managers see a hint. */
export function PlaceholderBlock({ id, type, heading, data }: { id: string; type: string; heading: string; data: LoadedCommunity }) {
  if (!data.perms.manage) return null;
  return (
    <BlockSection id={id} heading={heading}>
      <p className="rounded-ui border border-dashed border-border p-4 text-muted">{TEXT[type]}</p>
    </BlockSection>
  );
}
