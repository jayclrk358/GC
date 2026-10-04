'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Copies `text`, and says so (to screen readers too). English unless given translations. */
export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  failedLabel = 'Couldn’t copy. Select it instead.',
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  failedLabel?: string;
  className?: string;
}) {
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState('copied');
          } catch {
            setState('failed');
          }
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setState('idle'), 2000);
        }}
        className={cn(
          'mx-press inline-flex h-8 items-center gap-1.5 rounded-ui-sm px-2.5 text-xs font-semibold text-muted hover:bg-surface hover:text-fg',
          className,
        )}
      >
        {state === 'copied' ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
        {state === 'copied' ? copiedLabel : label}
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : ''}
      </span>
    </>
  );
}
