/** Socket.IO room names, shared by the realtime server and publishers. */
export const rooms = {
  user: (id: string) => `user:${id}`,
  community: (id: string) => `community:${id}`,
  channel: (id: string) => `channel:${id}`,
  thread: (id: string) => `thread:${id}`,
  server: (endpointId: string) => `server:${endpointId}`,
} as const;
