'use client';

import * as React from 'react';
import type { Prefs, RichNode } from '@magnox/shared';
import type { ChatChannelInfo, ChatMe, ChatMessage, ChatPerms } from './types';

export interface ChatActions {
  reply: (m: ChatMessage) => void;
  startEdit: (m: ChatMessage) => void;
  cancelEdit: () => void;
  saveEdit: (m: ChatMessage, body: RichNode) => Promise<boolean>;
  toggleReaction: (m: ChatMessage, emoji: string) => void;
  remove: (m: ChatMessage) => void;
  pin: (m: ChatMessage, pinned: boolean) => void;
  report: (m: ChatMessage) => void;
  jumpTo: (id: string) => void;
  retry: (m: ChatMessage) => void;
  discard: (m: ChatMessage) => void;
  copyLink: (m: ChatMessage) => void;
  focusComposer: () => void;
}

export interface ChatContextValue {
  communityId: string;
  slug: string;
  channel: ChatChannelInfo;
  me: ChatMe | null;
  perms: ChatPerms;
  prefs: Prefs;
  blocked: ReadonlySet<string>;
  editingId: string | null;
  actions: ChatActions;
}

const Ctx = React.createContext<ChatContextValue | null>(null);

export function ChatProvider({
  value,
  children,
}: {
  value: ChatContextValue;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat(): ChatContextValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useChat must be used inside ChatProvider');
  return v;
}
