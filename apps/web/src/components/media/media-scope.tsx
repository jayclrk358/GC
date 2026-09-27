'use client';

import * as React from 'react';
import { MediaViewer, type MediaItem } from './media-viewer';

/**
 * Opens the media viewer for any `[data-mx-view]` button inside it (the key is the attribute's
 * value, the alt text comes from the image). Lets server-rendered content such as rich text use
 * the viewer without becoming a client component.
 */
export function MediaScope({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [items, setItems] = React.useState<MediaItem[]>([]);
  const [index, setIndex] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  function onClick(e: React.MouseEvent) {
    const root = ref.current;
    const target = (e.target as Element).closest<HTMLElement>('[data-mx-view]');
    if (!root || !target || target.closest('[data-mx-scope]') !== root) return;
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-mx-view]')).filter(
      (b) => b.closest('[data-mx-scope]') === root,
    );
    setItems(
      buttons.map((b) => {
        const img = b.querySelector('img');
        return {
          key: b.dataset.mxView ?? '',
          alt: img?.alt ?? '',
          width: img?.naturalWidth || undefined,
          height: img?.naturalHeight || undefined,
        };
      }),
    );
    setIndex(buttons.indexOf(target));
    setOpen(true);
  }

  return (
    // The clicks come from real buttons inside (so keyboards work too); this only listens.
    <div ref={ref} data-mx-scope="" className={className} onClick={onClick}>
      {children}
      <MediaViewer
        items={items}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
