import type { MessageView } from '@gamecentral/core';

/** A message on screen: server messages plus optimistic ones still sending (or failed). */
export type ChatMessage = MessageView & { pending?: boolean; failed?: string | null };

export interface ChatMe {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  roleIds: string[];
}

export interface ChatPerms {
  signedIn: boolean;
  member: boolean;
  send: boolean;
  react: boolean;
  attach: boolean;
  manage: boolean;
  history: boolean;
  timedOutUntil: string | null;
  /** From the community's plan. */
  maxAttachments: number;
  maxVideoMb: number;
}

export interface ChatChannelInfo {
  id: string;
  name: string;
  topic: string;
  slowmodeSeconds: number;
}
