'use client';

import * as React from 'react';
import type { ChatEditor as EditorComponent, ChatEditorHandle } from './chat-editor';

export type { ChatEditorHandle } from './chat-editor';

type Props = React.ComponentPropsWithoutRef<typeof EditorComponent>;

// Tiptap and ProseMirror are the biggest code on a chat page, and many visitors only read, so
// the editor loads in its own chunk when a composer (or an edit box) is actually shown.
const Editor = React.lazy(() => import('./chat-editor').then((m) => ({ default: m.ChatEditor })));

/** The chat input, loaded on demand. Until it arrives the box keeps its height. */
export const ChatEditor = React.forwardRef<ChatEditorHandle, Props>(
  function LazyChatEditor(props, ref) {
    return (
      <React.Suspense fallback={<div aria-hidden className="min-h-10 min-w-0 flex-1" />}>
        <Editor ref={ref} {...props} />
      </React.Suspense>
    );
  },
);
