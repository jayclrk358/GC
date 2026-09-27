export const VISIBILITY = ['public', 'unlisted', 'private'] as const;
export const JOIN_MODES = ['open', 'apply', 'invite'] as const;
export const COMMUNITY_TEMPLATES = ['server', 'clan', 'fanhub', 'creator'] as const;
export type CommunityTemplate = (typeof COMMUNITY_TEMPLATES)[number];

export const REGIONS = [
  'global',
  'na-east',
  'na-west',
  'south-america',
  'europe-west',
  'europe-east',
  'uk',
  'middle-east',
  'africa',
  'asia-east',
  'asia-southeast',
  'india',
  'oceania',
] as const;

export const LANGUAGES = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'nl',
  'pl',
  'ru',
  'uk',
  'tr',
  'ar',
  'hi',
  'ja',
  'ko',
  'zh',
  'sv',
  'no',
  'da',
  'fi',
  'cs',
  'other',
] as const;
