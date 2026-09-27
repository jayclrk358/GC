import type { MessageView } from '@magnox/core';
import type { ChatMessage } from './types';

export interface ChatState {
  messages: ChatMessage[];
  hasMoreBefore: boolean;
  /** True when we're looking at older history, not the live end of the channel. */
  hasMoreAfter: boolean;
  history: boolean;
}

export type ChatAction =
  | {
      type: 'replace';
      page: {
        messages: MessageView[];
        hasMoreBefore: boolean;
        hasMoreAfter: boolean;
        history: boolean;
      };
    }
  | { type: 'prepend'; messages: MessageView[]; hasMoreBefore: boolean }
  | { type: 'append'; messages: MessageView[]; hasMoreAfter: boolean }
  | { type: 'incoming'; message: MessageView }
  | { type: 'pending'; message: ChatMessage }
  | { type: 'sent'; nonce: string; message: MessageView }
  | { type: 'failed'; nonce: string; error: string }
  | { type: 'discard'; nonce: string }
  | { type: 'patch'; id: string; patch: Partial<MessageView> }
  | { type: 'remove'; id: string }
  | {
      type: 'reactions';
      id: string;
      reactions: { emoji: string; count: number }[];
      actorId: string;
      emoji: string;
      added: boolean;
      me: string | null;
    };

const byId = (a: ChatMessage, b: ChatMessage) => {
  // Optimistic messages always sit at the end, in the order they were written.
  if (a.pending !== b.pending) return a.pending ? 1 : -1;
  if (a.pending && b.pending) return a.createdAt.localeCompare(b.createdAt);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Insert or replace one message, matching optimistic copies by nonce. */
function upsert(list: ChatMessage[], m: MessageView): ChatMessage[] {
  const i = list.findIndex((x) => x.id === m.id || (m.nonce && x.nonce === m.nonce));
  if (i >= 0) {
    const next = list.slice();
    // Keep "mine" on reactions from the local copy; server events carry no per-viewer state.
    next[i] = { ...m, reactions: m.reactions.length ? m.reactions : list[i]!.reactions };
    return next.sort(byId);
  }
  return [...list, m].sort(byId);
}

function mergeUnique(list: ChatMessage[], incoming: MessageView[]): ChatMessage[] {
  let out = list;
  for (const m of incoming) out = upsert(out, m);
  return out;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'replace': {
      const pending = state.messages.filter((m) => m.pending || m.failed);
      return {
        messages: mergeUnique(pending, action.page.messages),
        hasMoreBefore: action.page.hasMoreBefore,
        hasMoreAfter: action.page.hasMoreAfter,
        history: action.page.history,
      };
    }
    case 'prepend':
      return {
        ...state,
        messages: mergeUnique(state.messages, action.messages),
        hasMoreBefore: action.hasMoreBefore,
      };
    case 'append':
      return {
        ...state,
        messages: mergeUnique(state.messages, action.messages),
        hasMoreAfter: action.hasMoreAfter,
      };
    case 'incoming': {
      const known = state.messages.some(
        (x) =>
          x.id === action.message.id || (action.message.nonce && x.nonce === action.message.nonce),
      );
      // While reading old history, new messages aren't appended (the gap would be wrong);
      // they're fetched when the reader jumps back to the present.
      if (state.hasMoreAfter && !known) return state;
      return { ...state, messages: upsert(state.messages, action.message) };
    }
    case 'pending':
      return { ...state, messages: [...state.messages, action.message].sort(byId) };
    case 'sent': {
      // The socket event may already have replaced the optimistic copy. That copy is at least as
      // new as this HTTP reply (it may already carry link previews), so it wins.
      const confirmed = state.messages.some((m) => m.id === action.message.id && !m.pending);
      const messages = confirmed
        ? state.messages.filter((m) => !(m.nonce === action.nonce && m.pending))
        : upsert(state.messages, action.message);
      return {
        ...state,
        messages: messages.filter((m, i) => messages.findIndex((x) => x.id === m.id) === i),
      };
    }
    case 'failed':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.nonce === action.nonce && m.pending
            ? { ...m, pending: false, failed: action.error }
            : m,
        ),
      };
    case 'discard':
      return {
        ...state,
        messages: state.messages.filter(
          (m) => !(m.nonce === action.nonce && (m.pending || m.failed)),
        ),
      };
    case 'patch':
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)),
      };
    case 'remove':
      return {
        ...state,
        messages: state.messages
          .filter((m) => m.id !== action.id)
          .map((m) =>
            m.replyTo?.id === action.id
              ? { ...m, replyTo: { ...m.replyTo, deleted: true, excerpt: '' } }
              : m,
          ),
      };
    case 'reactions':
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== action.id) return m;
          const mine = new Set(m.reactions.filter((r) => r.mine).map((r) => r.emoji));
          if (action.me && action.actorId === action.me) {
            if (action.added) mine.add(action.emoji);
            else mine.delete(action.emoji);
          }
          return {
            ...m,
            reactions: action.reactions.map((r) => ({ ...r, mine: mine.has(r.emoji) })),
          };
        }),
      };
    default:
      return state;
  }
}
