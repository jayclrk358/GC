/** Socket.IO room names, shared by the realtime server and publishers. */
export const rooms = {
  user: (id: string) => `user:${id}`,
  community: (id: string) => `community:${id}`,
  /** A channel's activity: forum thread lists, and chat unread pings for the sidebar. */
  channel: (id: string) => `channel:${id}`,
  /** Everything happening in a chat channel, for people who have it open. */
  chat: (id: string) => `chat:${id}`,
  thread: (id: string) => `thread:${id}`,
  server: (endpointId: string) => `server:${endpointId}`,
} as const;
