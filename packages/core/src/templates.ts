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

export interface TemplateDef {
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
