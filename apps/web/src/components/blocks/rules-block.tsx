import type { BlockConfig } from '@gamecentral/shared';
import { BlockSection } from './section';

export function RulesBlock({ id, config }: { id: string; config: BlockConfig<'rules'> }) {
  if (!config.rules.length) return null;
  return (
    <BlockSection id={id} heading={config.heading}>
      <ol className="flex flex-col gap-2">
        {config.rules.map((r, i) => (
          <li key={i} className="flex gap-4 rounded-ui border border-border bg-surface p-4">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary font-bold text-on-primary"
            >
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{r.title}</p>
              {r.description && <p className="mt-0.5 text-muted">{r.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </BlockSection>
  );
}
