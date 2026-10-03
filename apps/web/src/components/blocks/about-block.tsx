import type { BlockConfig } from '@gamecentral/shared';
import { RichText } from '@/components/rich-text/rich-text';
import { BlockSection } from './section';

export function AboutBlock({
  id,
  config,
}: {
  id: string;
  config: BlockConfig<'about'> | BlockConfig<'richText'>;
}) {
  return (
    <BlockSection id={id} heading={config.heading || undefined}>
      <div className="rounded-ui-lg border border-border bg-surface p-5 sm:p-6">
        <RichText doc={config.doc} headingOffset={config.heading ? 1 : 0} />
      </div>
    </BlockSection>
  );
}
