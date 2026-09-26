'use client';

import * as React from 'react';

export interface ReplyTarget {
  postId: string;
  authorName: string;
}

interface ThreadContextValue {
  replyTo: ReplyTarget | null;
  setReplyTo: (t: ReplyTarget | null) => void;
  composerRef: React.RefObject<HTMLDivElement | null>;
}

const Ctx = React.createContext<ThreadContextValue | null>(null);

export function ThreadProvider({ children }: { children: React.ReactNode }) {
  const [replyTo, setReplyTo] = React.useState<ReplyTarget | null>(null);
  const composerRef = React.useRef<HTMLDivElement | null>(null);
  const value = React.useMemo(() => ({ replyTo, setReplyTo, composerRef }), [replyTo]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThread(): ThreadContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useThread must be used inside ThreadProvider');
  return ctx;
}
