import type { BlockConfig } from '@magnox/shared';
import { BlockSection } from './section';

export function FaqBlock({ id, config }: { id: string; config: BlockConfig<'faq'> }) {
  if (!config.items.length) return null;
  return (
    <BlockSection id={id} heading={config.heading}>
      <div className="flex flex-col gap-2">
        {config.items.map((item, i) => (
          <details key={i} className="group rounded-ui border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-semibold [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="px-4 pb-4 whitespace-pre-line text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </BlockSection>
  );
}
