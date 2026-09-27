'use client';

import * as React from 'react';
import type { RichTextEditor as EditorComponent } from './editor';

type EditorProps = React.ComponentProps<typeof EditorComponent>;

// The editor (Tiptap and ProseMirror) is the biggest thing on the page, and most visitors only
// read, so its code loads in its own chunk after the page is usable.
const Editor = React.lazy(() => import('./editor').then((m) => ({ default: m.RichTextEditor })));

/** The editor's footprint, shown while its code loads so nothing jumps when it arrives. */
function EditorPlaceholder({ minHeight = '10rem' }: { minHeight?: string }) {
  return (
    <div aria-hidden className="rounded-ui border border-muted/70 bg-surface">
      <div className="h-10 border-b border-border" />
      <div className="mx-skeleton rounded-b-ui" style={{ minHeight }} />
    </div>
  );
}

export function RichTextEditor(props: EditorProps) {
  return (
    <React.Suspense fallback={<EditorPlaceholder minHeight={props.minHeight} />}>
      <Editor {...props} />
    </React.Suspense>
  );
}
