// What's new on Game Central: shown at /changelog, and in the Windows app (on its loading screen
// and in its "What's new" window, which it fetches from /api/changelog). Newest first. Add an
// entry with each update people will notice; keep ids unchanged once published, since the app
// remembers which one it showed last.

export interface ChangelogEntry {
  /** Stable and unique: the date and a few words. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-03-windows-app-1-1',
    date: '2026-10-03',
    title: 'Sign in through your browser on Windows',
    items: [
      'In the Windows app, Discord, Google and Twitch sign-in now happen in your own browser, so if you’re already signed in there, it’s one click. Google sign-in works in the app now too.',
      'The Windows app has a loading screen, and shows what’s new after each update.',
      'The Windows app is a smaller download.',
      'Sign-in buttons show the Discord, Google and Twitch logos.',
    ],
  },
  {
    id: '2026-10-03-game-central',
    date: '2026-10-03',
    title: 'Magnox is now Game Central',
    items: [
      'A new name and a new logo, at gamecentral.app. Your account, communities and settings carry on as they were.',
    ],
  },
  {
    id: '2026-10-02-staff-badges',
    date: '2026-10-02',
    title: 'Feedback, staff badges and sounds',
    items: [
      'Send feedback or ideas from the account menu, and follow along as the team replies.',
      'Game Central staff show a badge on their profile.',
      'Sound effects for messages, mentions and voice, with packs to choose from in Settings.',
      '35 more game server types and 40 more games.',
    ],
  },
  {
    id: '2026-10-02-languages',
    date: '2026-10-02',
    title: 'More languages and a public API',
    items: [
      'Game Central is now in Spanish, French, German and Brazilian Portuguese.',
      'Personal API tokens and webhooks for scripts and bots (see Developers).',
    ],
  },
];
