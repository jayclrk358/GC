'use client';

import * as React from 'react';
import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Third-party embeds only load after the viewer asks for them: nothing autoplays, and no
 * requests go to the provider until then.
 */
export function ClickToLoad({
  src,
  title,
  provider,
}: {
  src: string;
  title: string;
  provider: string;
}) {
  const [loaded, setLoaded] = React.useState(false);
  return (
    <div className="aspect-video overflow-hidden rounded-ui-lg border border-border bg-surface-2">
      {loaded ? (
        <iframe
          src={src}
          title={title}
          className="size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
          <PlayCircle className="size-12 text-primary" aria-hidden />
          <p className="font-semibold">{title}</p>
          <p className="max-w-md text-sm text-muted">Loading this will connect to {provider}.</p>
          <Button onClick={() => setLoaded(true)}>
            Load {provider} player<span className="sr-only">: {title}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
