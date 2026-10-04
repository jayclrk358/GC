// The public API (v1), described once: the developer docs page and /api/v1/openapi.json are both
// made from this, and a unit test checks it lists exactly the routes under app/api/v1.

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Param {
  name: string;
  in: 'path' | 'query' | 'body';
  type: string;
  required?: boolean;
  description: string;
}

export interface Endpoint {
  /** Anchor on the docs page, and the OpenAPI operationId. */
  id: string;
  method: Method;
  /** Under /api/v1. */
  path: string;
  title: string;
  description: string;
  /** Needs a token that can post and make changes. */
  write?: boolean;
  params?: Param[];
  /** A query string for the examples, like `?limit=20`. */
  query?: string;
  /** A request body for the examples. */
  body?: Record<string, unknown>;
  /** What `data` holds in a successful response. */
  response: unknown;
  status?: number;
}

export interface EndpointGroup {
  id: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

export interface ApiObject {
  id: string;
  title: string;
  description: string;
  fields: [name: string, type: string, description: string][];
}

const ID = {
  user: 'bEC6DZJ804UbsTWZ4QXFqtavdNH4Owjd',
  other: 'Q2b7Lr0kXyZ9mWcVd3tNs8aEf1gHj4Kp',
  community: '0192f1c4-6a2e-7b3c-9d4e-5f6a7b8c9d0e',
  channel: '0192f1c4-7b3c-7c4d-8e5f-6a7b8c9d0e1f',
  forum: '0192f1c4-8c4d-7d5e-9f6a-7b8c9d0e1f2a',
  message: '0192f1d0-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
  thread: '0192f1d0-2b3c-7d4e-9f5a-6b7c8d9e0f1a',
  post: '0192f1d0-3c4d-7e5f-8a6b-7c8d9e0f1a2b',
  role: '0192f1c4-9d5e-7e6f-8a7b-8c9d0e1f2a3b',
  event: '0192f1e2-4d5e-7f6a-9b7c-8d9e0f1a2b3c',
  server: '0192f1e2-5e6f-7a7b-8c8d-9e0f1a2b3c4d',
  page: '0192f1e2-6f7a-7b8c-9d9e-0f1a2b3c4d5e',
};
const SITE = 'https://gamecentral.app';

const author = { id: ID.user, name: 'Alice', username: 'alice', avatarUrl: null };

const message = {
  id: ID.message,
  channelId: ID.channel,
  kind: 'user',
  content: 'Server restarting in 5 minutes',
  author,
  replyToId: null,
  attachments: [],
  reactions: [{ emoji: '👍', count: 3 }],
  pinned: false,
  editedAt: null,
  createdAt: '2026-10-04T18:30:00.000Z',
};

const status = {
  online: true,
  players: 42,
  maxPlayers: 100,
  map: 'Survival',
  version: '1.21.4',
  pingMs: 38,
  name: 'My Clan SMP',
  checkedAt: '2026-10-04T18:29:30.000Z',
};

const server = {
  id: ID.server,
  name: 'My Clan SMP',
  game: 'Minecraft (Java)',
  protocol: 'minecraft',
  address: 'play.myclan.gg',
  connectUrl: null,
  tags: ['survival', 'pvp'],
  region: 'eu-west',
  verified: true,
  votes: 318,
  status,
  url: `${SITE}/servers/${ID.server}`,
};

const thread = {
  id: ID.thread,
  title: 'Season 4 plans',
  channel: { id: ID.forum, name: 'general' },
  author,
  pinned: false,
  locked: false,
  solved: false,
  score: 12,
  replyCount: 8,
  flair: 'Discussion',
  createdAt: '2026-10-01T12:00:00.000Z',
  lastActivityAt: '2026-10-04T17:45:00.000Z',
  url: `${SITE}/c/my-clan/t/${ID.thread}`,
};

const slug: Param = {
  name: 'slug',
  in: 'path',
  type: 'string',
  required: true,
  description: 'The community’s address, as in /c/{slug}.',
};
const pageParam: Param = {
  name: 'page',
  in: 'query',
  type: 'integer',
  description: 'Which page, from 0.',
};
const limit = (max: number, fallback: number): Param => ({
  name: 'limit',
  in: 'query',
  type: 'integer',
  description: `How many per page, up to ${max} (${fallback} if left out).`,
});
const idParam = (what: string): Param => ({
  name: 'id',
  in: 'path',
  type: 'uuid',
  required: true,
  description: `The ${what}’s id.`,
});

export const API_GROUPS: EndpointGroup[] = [
  {
    id: 'users',
    title: 'You and other people',
    description: 'Who the token belongs to, and anyone’s public profile.',
    endpoints: [
      {
        id: 'get-me',
        method: 'GET',
        path: '/me',
        title: 'Get yourself',
        description: 'The token’s owner, and the communities they’re in.',
        response: {
          id: ID.user,
          name: 'Alice',
          username: 'alice',
          communities: [{ id: ID.community, slug: 'my-clan', name: 'My Clan', owner: true }],
        },
      },
      {
        id: 'get-user',
        method: 'GET',
        path: '/users/{username}',
        title: 'Get a profile',
        description:
          'Someone’s public profile, as shown on their page. Only public communities are listed.',
        params: [
          {
            name: 'username',
            in: 'path',
            type: 'string',
            required: true,
            description: 'Their username, without the @.',
          },
        ],
        response: {
          id: ID.user,
          name: 'Alice',
          username: 'alice',
          avatarUrl: null,
          bannerUrl: null,
          bio: 'Builder, raid leader, coffee enthusiast.',
          pronouns: 'she/her',
          status: 'Grinding the battle pass',
          location: 'Bristol',
          timezone: 'Europe/London',
          languages: ['en'],
          platforms: ['pc'],
          lookingForGroup: true,
          nowPlaying: 'Minecraft',
          games: ['Minecraft', 'Valorant'],
          links: [{ label: 'Twitch', url: 'https://twitch.tv/alice' }],
          communities: [{ slug: 'my-clan', name: 'My Clan' }],
          staff: false,
          createdAt: '2025-11-02T09:14:00.000Z',
          url: `${SITE}/u/alice`,
        },
      },
    ],
  },
  {
    id: 'communities',
    title: 'Communities',
    description:
      'The public directory, and a community’s details, channels, members and roles. A community you can’t see (private, and you’re not in it) answers 404.',
    endpoints: [
      {
        id: 'list-communities',
        query: '?q=survival&limit=10',
        method: 'GET',
        path: '/communities',
        title: 'Search the directory',
        description:
          'Public communities, as on Explore: most members first, or best match for ?q=.',
        params: [
          { name: 'q', in: 'query', type: 'string', description: 'Words to search for.' },
          { name: 'game', in: 'query', type: 'string', description: 'A game’s id.' },
          { name: 'tag', in: 'query', type: 'string', description: 'Only with this tag.' },
          { name: 'region', in: 'query', type: 'string', description: 'Only in this region.' },
          {
            name: 'language',
            in: 'query',
            type: 'string',
            description: 'A language code, like en.',
          },
          {
            name: 'sort',
            in: 'query',
            type: '"popular" | "new" | "relevance"',
            description: 'The order.',
          },
          pageParam,
          limit(48, 24),
        ],
        response: {
          communities: [
            {
              id: ID.community,
              slug: 'my-clan',
              name: 'My Clan',
              tagline: 'Casual survival and weekly raids',
              game: 'Minecraft',
              tags: ['survival', 'eu'],
              region: 'eu-west',
              language: 'en',
              memberCount: 1284,
              joinMode: 'open',
              createdAt: '2025-08-14T10:00:00.000Z',
              url: `${SITE}/c/my-clan`,
            },
          ],
          page: 0,
          pageSize: 24,
          total: 1,
        },
      },
      {
        id: 'get-community',
        method: 'GET',
        path: '/communities/{slug}',
        title: 'Get a community',
        description: 'A community: name, members, how to join, and your place in it.',
        params: [slug],
        response: {
          id: ID.community,
          slug: 'my-clan',
          name: 'My Clan',
          tagline: 'Casual survival and weekly raids',
          memberCount: 1284,
          visibility: 'public',
          joinMode: 'open',
          archived: false,
          url: `${SITE}/c/my-clan`,
          you: { member: true, owner: false },
        },
      },
      {
        id: 'list-channels',
        method: 'GET',
        path: '/communities/{slug}/channels',
        title: 'List channels',
        description:
          'The channels you can see, in order. Categories have the type category; other channels name theirs in parentId.',
        params: [slug],
        response: {
          channels: [
            {
              id: ID.channel,
              name: 'lounge',
              type: 'text',
              parentId: null,
              topic: 'Say hi!',
              position: 0,
            },
            {
              id: ID.forum,
              name: 'general',
              type: 'forum',
              parentId: null,
              topic: '',
              position: 1,
            },
          ],
        },
      },
      {
        id: 'list-members',
        query: '?limit=100',
        method: 'GET',
        path: '/communities/{slug}/members',
        title: 'List members',
        description: 'Members, longest-standing first. Each lists the ids of their roles.',
        params: [
          slug,
          { name: 'q', in: 'query', type: 'string', description: 'Search names and usernames.' },
          { name: 'role', in: 'query', type: 'uuid', description: 'Only members with this role.' },
          pageParam,
          limit(100, 50),
        ],
        response: {
          members: [
            {
              id: ID.user,
              name: 'Alice',
              username: 'alice',
              nickname: null,
              avatarUrl: null,
              roles: [ID.role],
              owner: true,
              joinedAt: '2025-08-14T10:00:00.000Z',
            },
          ],
          page: 0,
          pageSize: 50,
          hasMore: false,
        },
      },
      {
        id: 'list-roles',
        method: 'GET',
        path: '/communities/{slug}/roles',
        title: 'List roles',
        description:
          'Roles, highest first. The one with everyone: true is the role every member has.',
        params: [slug],
        response: {
          roles: [
            {
              id: ID.role,
              name: 'Moderator',
              color: '#3b82f6',
              iconUrl: null,
              position: 2,
              everyone: false,
              hoist: true,
              mentionable: true,
              selfAssignable: false,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'chat',
    title: 'Chat',
    description:
      'Messages in text and announcement channels. Posting, editing, deleting and reacting act as you and follow the same rules as the site: permissions, slow mode, automod and rate limits.',
    endpoints: [
      {
        id: 'list-messages',
        query: '?limit=20',
        method: 'GET',
        path: '/channels/{id}/messages',
        title: 'List messages',
        description:
          'A channel’s messages, oldest first: the latest ones, or a page before or after a message.',
        params: [
          idParam('channel'),
          { name: 'before', in: 'query', type: 'uuid', description: 'Messages before this one.' },
          { name: 'after', in: 'query', type: 'uuid', description: 'Messages after this one.' },
          limit(100, 50),
        ],
        response: { messages: [message], hasMoreBefore: true, hasMoreAfter: false },
      },
      {
        id: 'send-message',
        method: 'POST',
        path: '/channels/{id}/messages',
        title: 'Send a message',
        description:
          'Post a message as you. Send a nonce to make retries safe: the same nonce again returns the first message instead of posting twice.',
        write: true,
        status: 201,
        params: [
          idParam('channel'),
          {
            name: 'content',
            in: 'body',
            type: 'string',
            required: true,
            description: 'The text, up to 2,000 characters.',
          },
          { name: 'replyToId', in: 'body', type: 'uuid', description: 'A message to reply to.' },
          {
            name: 'nonce',
            in: 'body',
            type: 'string',
            description: '8–64 letters, digits and dashes, unique to this message.',
          },
        ],
        body: { content: 'Server restarting in 5 minutes', nonce: 'restart-2026-10-04' },
        response: message,
      },
      {
        id: 'list-pins',
        method: 'GET',
        path: '/channels/{id}/pins',
        title: 'List pinned messages',
        description: 'A channel’s pinned messages, most recently pinned first.',
        params: [idParam('channel')],
        response: { messages: [{ ...message, pinned: true }] },
      },
      {
        id: 'get-message',
        method: 'GET',
        path: '/messages/{id}',
        title: 'Get a message',
        description: 'One message, if you can see its channel.',
        params: [idParam('message')],
        response: message,
      },
      {
        id: 'edit-message',
        method: 'PATCH',
        path: '/messages/{id}',
        title: 'Edit a message',
        description: 'Change the text of one of your own messages.',
        write: true,
        params: [
          idParam('message'),
          {
            name: 'content',
            in: 'body',
            type: 'string',
            required: true,
            description: 'The new text, up to 2,000 characters.',
          },
        ],
        body: { content: 'Server restarting in 10 minutes' },
        response: {
          ...message,
          content: 'Server restarting in 10 minutes',
          editedAt: '2026-10-04T18:31:00.000Z',
        },
      },
      {
        id: 'delete-message',
        method: 'DELETE',
        path: '/messages/{id}',
        title: 'Delete a message',
        description:
          'Delete one of your own messages, or anyone’s in a channel where you can manage messages.',
        write: true,
        params: [idParam('message')],
        response: { id: ID.message, deleted: true },
      },
      {
        id: 'add-reaction',
        method: 'PUT',
        path: '/messages/{id}/reactions/{emoji}',
        title: 'React to a message',
        description:
          'Add your reaction. Doing it again changes nothing, so it’s safe to retry. URL-encode the emoji (👍 is %F0%9F%91%8D).',
        write: true,
        params: [
          idParam('message'),
          {
            name: 'emoji',
            in: 'path',
            type: 'string',
            required: true,
            description:
              'One of the reactions the site offers (👍 ❤️ 😂 🎉 😮 😢 🔥 👀 ✅ ❌ 💯 🙏 👋 and more), or a community emoji as c:{id}.',
          },
        ],
        response: { emoji: '👍', reacted: true, count: 4 },
      },
      {
        id: 'remove-reaction',
        method: 'DELETE',
        path: '/messages/{id}/reactions/{emoji}',
        title: 'Remove your reaction',
        description: 'Take your reaction back. Safe to retry.',
        write: true,
        params: [
          idParam('message'),
          {
            name: 'emoji',
            in: 'path',
            type: 'string',
            required: true,
            description: 'The reaction, URL-encoded.',
          },
        ],
        response: { emoji: '👍', reacted: false, count: 3 },
      },
    ],
  },
  {
    id: 'forums',
    title: 'Forums',
    description: 'Threads and replies in forum and announcement channels.',
    endpoints: [
      {
        id: 'list-threads',
        query: `?channel=${ID.forum}&sort=top`,
        method: 'GET',
        path: '/communities/{slug}/threads',
        title: 'List threads',
        description:
          'Threads in one forum (with ?channel=), or the 10 latest across every forum you can see.',
        params: [
          slug,
          { name: 'channel', in: 'query', type: 'uuid', description: 'A forum channel’s id.' },
          {
            name: 'sort',
            in: 'query',
            type: '"latest" | "new" | "top" | "hot" | "unanswered"',
            description: 'With ?channel=: the order (the forum’s own default if left out).',
          },
          { ...pageParam, description: 'With ?channel=: which page, from 0.' },
        ],
        response: {
          threads: [
            {
              id: ID.thread,
              title: 'Season 4 plans',
              channel: 'general',
              author: 'Alice',
              pinned: false,
              locked: false,
              solved: false,
              score: 12,
              replyCount: 8,
              flair: 'Discussion',
              createdAt: '2026-10-01T12:00:00.000Z',
              lastActivityAt: '2026-10-04T17:45:00.000Z',
              url: `${SITE}/c/my-clan/t/${ID.thread}`,
            },
          ],
          page: 0,
          pageSize: 25,
          total: 1,
        },
      },
      {
        id: 'create-thread',
        method: 'POST',
        path: '/communities/{slug}/threads',
        title: 'Start a thread',
        description:
          'Start a thread in one of the community’s forums, as you. Only moderators can post in announcement channels.',
        write: true,
        status: 201,
        params: [
          slug,
          {
            name: 'channelId',
            in: 'body',
            type: 'uuid',
            required: true,
            description: 'The forum to post in.',
          },
          {
            name: 'title',
            in: 'body',
            type: 'string',
            required: true,
            description: '3–200 characters.',
          },
          {
            name: 'content',
            in: 'body',
            type: 'string',
            required: true,
            description: 'The first post, as plain text (blank lines start new paragraphs).',
          },
        ],
        body: {
          channelId: ID.forum,
          title: 'Season 4 plans',
          content: 'Here’s what we’re thinking for next season…',
        },
        response: { ...thread, score: 0, replyCount: 0, flair: null },
      },
      {
        id: 'get-thread',
        method: 'GET',
        path: '/threads/{id}',
        title: 'Get a thread',
        description: 'A thread, if you can see its forum.',
        params: [idParam('thread')],
        response: thread,
      },
      {
        id: 'list-posts',
        query: '?page=0&limit=50',
        method: 'GET',
        path: '/threads/{id}/posts',
        title: 'List posts',
        description:
          'A thread’s posts, oldest first, starting with the opening post (op: true). Deleted posts keep their place with content: null.',
        params: [idParam('thread'), pageParam, limit(100, 30)],
        response: {
          posts: [
            {
              id: ID.post,
              op: true,
              content: 'Here’s what we’re thinking for next season…',
              author,
              replyToId: null,
              reactions: [{ emoji: '🔥', count: 5 }],
              deleted: false,
              editedAt: null,
              createdAt: '2026-10-01T12:00:00.000Z',
            },
          ],
          page: 0,
          pageSize: 30,
          total: 9,
        },
      },
      {
        id: 'create-post',
        method: 'POST',
        path: '/threads/{id}/posts',
        title: 'Reply to a thread',
        description: 'Reply in a thread as you. Locked threads only take replies from moderators.',
        write: true,
        status: 201,
        params: [
          idParam('thread'),
          {
            name: 'content',
            in: 'body',
            type: 'string',
            required: true,
            description: 'The reply, as plain text.',
          },
          {
            name: 'replyToId',
            in: 'body',
            type: 'uuid',
            description: 'A post in the thread to reply to.',
          },
        ],
        body: { content: 'Count me in for the raid nights!' },
        response: {
          id: ID.post,
          threadId: ID.thread,
          content: 'Count me in for the raid nights!',
          author,
          replyToId: null,
          createdAt: '2026-10-04T18:40:00.000Z',
          url: `${SITE}/c/my-clan/t/${ID.thread}/p/${ID.post}`,
        },
      },
    ],
  },
  {
    id: 'wiki',
    title: 'Wiki',
    description: 'A community’s wiki pages, as plain text.',
    endpoints: [
      {
        id: 'list-wiki-pages',
        method: 'GET',
        path: '/communities/{slug}/wiki',
        title: 'List wiki pages',
        description:
          'Every page, in the wiki’s order, each parent before its children (parentId says where a page sits).',
        params: [slug],
        response: {
          pages: [
            {
              id: ID.page,
              slug: 'rules',
              title: 'Server rules',
              parentId: null,
              protected: true,
              url: `${SITE}/c/my-clan/wiki/rules`,
            },
          ],
        },
      },
      {
        id: 'get-wiki-page',
        method: 'GET',
        path: '/communities/{slug}/wiki/{page}',
        title: 'Get a wiki page',
        description: 'One page and its text.',
        params: [
          slug,
          {
            name: 'page',
            in: 'path',
            type: 'string',
            required: true,
            description: 'The page’s slug, as in /c/{slug}/wiki/{page}.',
          },
        ],
        response: {
          id: ID.page,
          slug: 'rules',
          title: 'Server rules',
          parentId: null,
          protected: true,
          content: 'Be kind.\n\nNo griefing or cheating.',
          updatedBy: 'Alice',
          createdAt: '2025-08-14T10:05:00.000Z',
          updatedAt: '2026-09-30T20:12:00.000Z',
          url: `${SITE}/c/my-clan/wiki/rules`,
        },
      },
    ],
  },
  {
    id: 'events',
    title: 'Events',
    description:
      'A community’s calendar. A repeating event has one id; each of its dates is told apart by its start time.',
    endpoints: [
      {
        id: 'list-events',
        method: 'GET',
        path: '/communities/{slug}/events',
        title: 'List upcoming events',
        description:
          'The next 50 dates, soonest first, with each date of a repeating event separately.',
        params: [slug],
        response: {
          events: [
            {
              id: ID.event,
              title: 'Raid night',
              start: '2026-10-09T19:00:00.000Z',
              end: '2026-10-09T21:00:00.000Z',
              allDay: false,
              timezone: 'Europe/London',
              location: 'Discord voice / our SMP',
              repeats: true,
              capacity: 20,
              going: 14,
              maybe: 3,
              url: `${SITE}/c/my-clan/events/${ID.event}?at=2026-10-09T19%3A00%3A00.000Z`,
            },
          ],
        },
      },
      {
        id: 'get-event',
        method: 'GET',
        path: '/events/{id}',
        title: 'Get an event',
        description:
          'An event at one of its dates (the next one unless you ask for another), with who’s coming.',
        params: [
          idParam('event'),
          {
            name: 'at',
            in: 'query',
            type: 'date-time',
            description: 'A date of a repeating event: its start time.',
          },
        ],
        response: {
          id: ID.event,
          title: 'Raid night',
          description: 'Bring potions. Meet at spawn.',
          location: 'Discord voice / our SMP',
          timezone: 'Europe/London',
          allDay: false,
          capacity: 20,
          repeats: true,
          start: '2026-10-09T19:00:00.000Z',
          end: '2026-10-09T21:00:00.000Z',
          upcoming: ['2026-10-09T19:00:00.000Z', '2026-10-16T19:00:00.000Z'],
          going: 14,
          maybe: 3,
          full: false,
          cancelled: false,
          ended: false,
          attendees: [{ id: ID.user, name: 'Alice', username: 'alice', status: 'going' }],
          you: { rsvp: 'going', canRsvp: true },
          url: `${SITE}/c/my-clan/events/${ID.event}?at=2026-10-09T19%3A00%3A00.000Z`,
        },
      },
      {
        id: 'rsvp-event',
        method: 'PUT',
        path: '/events/{id}/rsvp',
        title: 'Answer an event',
        description:
          'Say whether you’re coming to a date (the next one unless you say which). status: null takes your answer back.',
        write: true,
        params: [
          idParam('event'),
          {
            name: 'status',
            in: 'body',
            type: '"going" | "maybe" | "declined" | null',
            required: true,
            description: 'Your answer.',
          },
          {
            name: 'at',
            in: 'body',
            type: 'date-time',
            description: 'Which date of a repeating event: its start time.',
          },
        ],
        body: { status: 'going' },
        response: { start: '2026-10-09T19:00:00.000Z', going: 15, maybe: 3, you: 'going' },
      },
    ],
  },
  {
    id: 'servers',
    title: 'Game servers',
    description:
      'Listed game servers with live status (checked every minute or so), and their player history.',
    endpoints: [
      {
        id: 'list-servers',
        query: '?game=minecraft&online=true',
        method: 'GET',
        path: '/servers',
        title: 'Search the server browser',
        description: 'Listed, verified servers, as in the server browser: most players first.',
        params: [
          { name: 'q', in: 'query', type: 'string', description: 'Words to search for.' },
          { name: 'game', in: 'query', type: 'string', description: 'A game’s id.' },
          { name: 'tag', in: 'query', type: 'string', description: 'Only with this tag.' },
          { name: 'region', in: 'query', type: 'string', description: 'Only in this region.' },
          {
            name: 'online',
            in: 'query',
            type: 'boolean',
            description: 'true: only servers up now.',
          },
          {
            name: 'minPlayers',
            in: 'query',
            type: 'integer',
            description: 'Only servers with at least this many players on.',
          },
          {
            name: 'sort',
            in: 'query',
            type: '"players" | "votes" | "new" | "name"',
            description: 'The order.',
          },
          pageParam,
        ],
        response: {
          servers: [{ ...server, community: { slug: 'my-clan', name: 'My Clan' } }],
          page: 0,
          pageSize: 24,
          total: 1,
        },
      },
      {
        id: 'list-community-servers',
        method: 'GET',
        path: '/communities/{slug}/servers',
        title: 'List a community’s servers',
        description: 'The game servers a community has added, with live status.',
        params: [slug],
        response: { servers: [server] },
      },
      {
        id: 'get-server',
        method: 'GET',
        path: '/servers/{id}',
        title: 'Get a server',
        description: 'A listed server (or one of your own) with live status.',
        params: [idParam('server')],
        response: {
          ...server,
          lastOnlineAt: '2026-10-04T18:29:30.000Z',
          downSince: null,
          votesThisMonth: 41,
        },
      },
      {
        id: 'get-server-history',
        query: '?range=7d',
        method: 'GET',
        path: '/servers/{id}/history',
        title: 'Get player history',
        description:
          'Players and uptime over a period, in buckets: 15 minutes for 24h, an hour for 7d, 6 hours for 30d. A bucket with no checks has nulls.',
        params: [
          idParam('server'),
          {
            name: 'range',
            in: 'query',
            type: '"24h" | "7d" | "30d"',
            description: 'The period (24h if left out).',
          },
        ],
        response: {
          range: '24h',
          bucketMinutes: 15,
          from: '2026-10-03T18:45:00.000Z',
          to: '2026-10-04T18:45:00.000Z',
          points: [{ t: '2026-10-04T18:30:00.000Z', players: 41.5, peak: 44, uptime: 1 }],
          summary: { uptime: 0.998, avgPlayers: 27.3, peakPlayers: 61 },
        },
      },
    ],
  },
];

export const ENDPOINTS: Endpoint[] = API_GROUPS.flatMap((g) => g.endpoints);

export const API_OBJECTS: ApiObject[] = [
  {
    id: 'message',
    title: 'Message',
    description: 'A chat message.',
    fields: [
      ['id', 'uuid', 'Ids sort by time: a later message has a greater id.'],
      ['channelId', 'uuid', 'The channel it’s in.'],
      [
        'kind',
        'string',
        'user for people’s messages; a notice from Game Central has its own kind, like server_down.',
      ],
      ['content', 'string', 'The text, with formatting removed.'],
      [
        'author',
        'Author | null',
        'id, name (their nickname here if they have one), username, avatarUrl.',
      ],
      ['replyToId', 'uuid | null', 'The message it replies to.'],
      ['attachments', 'object[]', 'url, alt, width, height of each image or video.'],
      ['reactions', 'object[]', 'emoji and count of each reaction.'],
      ['pinned', 'boolean', ''],
      ['editedAt', 'date-time | null', ''],
      ['createdAt', 'date-time', ''],
    ],
  },
  {
    id: 'thread',
    title: 'Thread',
    description: 'A forum thread. Its posts come from /threads/{id}/posts.',
    fields: [
      ['id', 'uuid', ''],
      ['title', 'string', ''],
      ['channel', 'object', 'id and name of its forum.'],
      ['author', 'Author | null', 'Who started it.'],
      [
        'pinned / locked',
        'boolean',
        'Pinned threads stay at the top; locked ones take no replies.',
      ],
      ['solved', 'boolean', 'A reply was marked as the answer.'],
      ['score', 'integer', 'Upvotes minus downvotes, where voting is on.'],
      ['replyCount', 'integer', ''],
      ['flair', 'string | null', 'Its label, like “Question”.'],
      ['createdAt / lastActivityAt', 'date-time', ''],
      ['url', 'string', 'The thread on the site.'],
    ],
  },
  {
    id: 'event',
    title: 'Event',
    description: 'One date of an event. All times are UTC; timezone is where it’s held.',
    fields: [
      ['id', 'uuid', 'The event (the same for every date of a repeating one).'],
      ['start / end', 'date-time', 'This date’s times.'],
      ['allDay', 'boolean', ''],
      ['timezone', 'string', 'An IANA zone, like Europe/London.'],
      ['repeats', 'boolean', ''],
      ['capacity', 'integer', 'How many can say they’re going (0: no limit).'],
      ['going / maybe', 'integer', 'Answers for this date.'],
    ],
  },
  {
    id: 'server',
    title: 'Server',
    description: 'A game server listing and what its last check found.',
    fields: [
      ['id', 'uuid', ''],
      ['name', 'string', ''],
      ['game / protocol', 'string', 'The game, and how it’s checked (minecraft, source, fivem…).'],
      ['address', 'string', 'What players connect to.'],
      ['connectUrl', 'string | null', 'A link that opens the game and joins, where there is one.'],
      ['verified', 'boolean', 'The owner proved it’s theirs.'],
      ['votes', 'integer', 'All-time votes.'],
      [
        'status',
        'object',
        'online, players, maxPlayers, map, version, pingMs, name (as the server reports it) and checkedAt.',
      ],
    ],
  },
];

export interface ErrorCode {
  status: number;
  code: string;
  meaning: string;
}

export const ERROR_CODES: ErrorCode[] = [
  {
    status: 401,
    code: 'unauthorized',
    meaning: 'No token, or it isn’t valid (it may have been deleted).',
  },
  {
    status: 403,
    code: 'forbidden',
    meaning: 'You’re not allowed: a read-only token tried to write, or you lack the permission.',
  },
  { status: 404, code: 'not_found', meaning: 'It doesn’t exist, or you can’t see it.' },
  {
    status: 400,
    code: 'bad_request',
    meaning: 'The request can’t be done as asked (an event that’s over, say).',
  },
  { status: 409, code: 'conflict', meaning: 'It clashes with how things are now.' },
  {
    status: 422,
    code: 'validation',
    meaning: 'A field is missing or invalid; the message says which.',
  },
  {
    status: 429,
    code: 'rate_limited',
    meaning: 'Too many requests. Wait the seconds in the Retry-After header.',
  },
  {
    status: 202,
    code: 'held',
    meaning:
      'Not an error: the community’s automod is holding your post for a moderator to review.',
  },
  {
    status: 500,
    code: 'internal',
    meaning: 'Something went wrong on our side. Try again shortly.',
  },
];
