import {
  DEFAULT_ADMIN,
  DEFAULT_MODERATOR,
  DEFAULT_NAV,
  docFromText,
  Permission,
  type BlockType,
  type CommunityTemplate,
  type NavConfig,
} from '@magnox/shared';

export interface TemplateRole {
  name: string;
  color: string | null;
  permissions: bigint;
  hoist: boolean;
  selfAssignable?: boolean;
}

export interface TemplateBlock {
  type: BlockType;
  config: Record<string, unknown>;
}

export interface TemplateChannel {
  type: 'forum' | 'announcement' | 'text';
  name: string;
  topic: string;
  settings?: {
    voting?: boolean;
    qa?: boolean;
    defaultSort?: 'latest' | 'hot' | 'top' | 'new' | 'unanswered';
  };
}

export interface TemplateDef {
  channels: { category: string; channels: TemplateChannel[] }[];
  roles: TemplateRole[];
  blocks: (ctx: { name: string; tagline: string }) => TemplateBlock[];
  nav: NavConfig;
}

const ADMIN: TemplateRole = {
  name: 'Admin',
  color: '#e11d48',
  permissions: DEFAULT_ADMIN,
  hoist: true,
};
const MOD: TemplateRole = {
  name: 'Moderator',
  color: '#2563eb',
  permissions: DEFAULT_MODERATOR,
  hoist: true,
};

const DEFAULT_RULES = [
  { title: 'Be respectful', description: 'No harassment, hate speech or personal attacks.' },
  {
    title: 'Keep it on topic',
    description: 'Post in the right place and keep discussions constructive.',
  },
  {
    title: 'No spam or self-promotion',
    description: 'Ask a moderator before sharing your own content.',
  },
];

function nav(order: string[]): NavConfig {
  const byTab = new Map(DEFAULT_NAV.map((n) => [n.tab as string, n]));
  const ordered = order.map((t) => byTab.get(t)!).filter(Boolean);
  const rest = DEFAULT_NAV.filter((n) => !order.includes(n.tab));
  return [...ordered, ...rest];
}

/** Starting points for a new community. Everything can be changed afterwards. */
export const TEMPLATES: Record<CommunityTemplate, TemplateDef> = {
  server: {
    channels: [
      {
        category: 'Chat',
        channels: [
          { type: 'text', name: 'lounge', topic: 'Say hi and hang out.' },
          { type: 'text', name: 'looking-for-group', topic: 'Find people to play with right now.' },
        ],
      },
      {
        category: 'Server',
        channels: [
          {
            type: 'announcement',
            name: 'announcements',
            topic: 'Updates, maintenance and events from the staff.',
          },
          { type: 'forum', name: 'general', topic: 'Talk about anything on the server.' },
          {
            type: 'forum',
            name: 'support',
            topic: 'Ask for help. Mark the reply that solved it.',
            settings: { qa: true },
          },
          {
            type: 'forum',
            name: 'suggestions',
            topic: 'Ideas for the server. Vote for the ones you like.',
            settings: { voting: true, defaultSort: 'top' },
          },
        ],
      },
    ],
    roles: [
      ADMIN,
      {
        name: 'Staff',
        color: '#7c3aed',
        permissions: DEFAULT_MODERATOR | Permission.MANAGE_SERVERS,
        hoist: true,
      },
      { name: 'VIP', color: '#d97706', permissions: 0n, hoist: true },
    ],
    nav: nav(['home', 'servers', 'forum', 'chat', 'events', 'wiki', 'members']),
    blocks: ({ name, tagline }) => [
      {
        type: 'hero',
        config: {
          heading: name,
          subheading: tagline || 'Join our server and meet the community.',
          ctaLabel: 'Join the community',
          ctaTarget: 'join',
        },
      },
      { type: 'serverStatus', config: { heading: 'Server status' } },
      { type: 'stats', config: {} },
      {
        type: 'about',
        config: {
          heading: 'About the server',
          doc: docFromText(
            'Tell players what makes your server special: game modes, mods, plugins and events.',
          ),
        },
      },
      { type: 'rules', config: { heading: 'Server rules', rules: DEFAULT_RULES } },
      {
        type: 'faq',
        config: {
          items: [
            {
              q: 'How do I join?',
              a: 'Copy the server address from the status card above and add it in your game.',
            },
            { q: 'Is there a whitelist?', a: 'Explain how players get access here.' },
          ],
        },
      },
    ],
  },
  clan: {
    channels: [
      {
        category: 'Chat',
        channels: [
          { type: 'text', name: 'squad-chat', topic: 'Day-to-day clan chat.' },
          { type: 'text', name: 'match-day', topic: 'Coordinate during scrims and matches.' },
        ],
      },
      {
        category: 'Clan',
        channels: [
          { type: 'announcement', name: 'announcements', topic: 'News from leadership.' },
          { type: 'forum', name: 'general', topic: 'Chat with the squad.' },
          {
            type: 'forum',
            name: 'strategy',
            topic: 'Tactics, loadouts and match reviews.',
            settings: { voting: true },
          },
        ],
      },
    ],
    roles: [
      { ...ADMIN, name: 'Leader' },
      { name: 'Officer', color: '#0891b2', permissions: DEFAULT_MODERATOR, hoist: true },
      { name: 'Member', color: '#16a34a', permissions: 0n, hoist: true },
      { name: 'Recruit', color: '#a3a3a3', permissions: 0n, hoist: false },
    ],
    nav: nav(['home', 'events', 'chat', 'forum', 'members', 'wiki', 'servers']),
    blocks: ({ name, tagline }) => [
      {
        type: 'hero',
        config: {
          heading: name,
          subheading: tagline || 'Squad up with us.',
          ctaLabel: 'Apply to join',
          ctaTarget: 'join',
        },
      },
      {
        type: 'about',
        config: {
          heading: 'Who we are',
          doc: docFromText('Describe your clan, its goals, schedule and play style.'),
        },
      },
      { type: 'upcomingEvents', config: {} },
      { type: 'staff', config: { heading: 'Leadership' } },
      { type: 'rules', config: { heading: 'Code of conduct', rules: DEFAULT_RULES } },
    ],
  },
  fanhub: {
    channels: [
      {
        category: 'Chat',
        channels: [
          { type: 'text', name: 'hangout', topic: 'Casual chat about the game.' },
          { type: 'text', name: 'screenshots', topic: 'Share your best moments.' },
        ],
      },
      {
        category: 'Discussion',
        channels: [
          { type: 'announcement', name: 'news', topic: 'Patch notes, news and community updates.' },
          {
            type: 'forum',
            name: 'general-discussion',
            topic: 'Everything about the game.',
            settings: { voting: true, defaultSort: 'hot' },
          },
          {
            type: 'forum',
            name: 'guides',
            topic: 'Tips, builds and walkthroughs.',
            settings: { voting: true, defaultSort: 'top' },
          },
          { type: 'forum', name: 'help', topic: 'Questions and answers.', settings: { qa: true } },
        ],
      },
    ],
    roles: [
      ADMIN,
      MOD,
      {
        name: 'Contributor',
        color: '#059669',
        permissions: Permission.EDIT_WIKI,
        hoist: false,
        selfAssignable: false,
      },
    ],
    nav: nav(['home', 'forum', 'wiki', 'chat', 'events', 'members', 'servers']),
    blocks: ({ name, tagline }) => [
      {
        type: 'hero',
        config: {
          heading: name,
          subheading: tagline || 'News, guides and discussion.',
          ctaLabel: 'Join the community',
          ctaTarget: 'join',
        },
      },
      { type: 'featuredThreads', config: {} },
      {
        type: 'about',
        config: {
          heading: 'About',
          doc: docFromText('What is this community about? Who is it for?'),
        },
      },
      { type: 'rules', config: { rules: DEFAULT_RULES } },
      { type: 'links', config: { links: [] } },
    ],
  },
  creator: {
    channels: [
      {
        category: 'Chat',
        channels: [
          { type: 'text', name: 'stream-chat', topic: 'Chat along during streams.' },
          { type: 'text', name: 'off-topic', topic: 'Anything goes (within the rules).' },
        ],
      },
      {
        category: 'Community',
        channels: [
          { type: 'announcement', name: 'announcements', topic: 'Stream schedule and news.' },
          { type: 'forum', name: 'general', topic: 'Hang out and chat.' },
          {
            type: 'forum',
            name: 'fan-creations',
            topic: 'Share your art, clips and edits.',
            settings: { voting: true, defaultSort: 'hot' },
          },
        ],
      },
    ],
    roles: [ADMIN, MOD, { name: 'Supporter', color: '#db2777', permissions: 0n, hoist: true }],
    nav: nav(['home', 'chat', 'forum', 'events', 'members', 'wiki', 'servers']),
    blocks: ({ name, tagline }) => [
      {
        type: 'hero',
        config: {
          heading: name,
          subheading: tagline || 'Welcome to the community!',
          ctaLabel: 'Join',
          ctaTarget: 'join',
        },
      },
      {
        type: 'about',
        config: {
          heading: 'About me',
          doc: docFromText('Introduce yourself and what you create.'),
        },
      },
      { type: 'links', config: { heading: 'Find me elsewhere', links: [] } },
      { type: 'upcomingEvents', config: { heading: 'Upcoming streams' } },
    ],
  },
};
