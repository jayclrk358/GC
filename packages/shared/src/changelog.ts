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
    id: '2026-10-04-scrollbars',
    date: '2026-10-04',
    title: 'Scrollbars that match',
    items: [
      'Scrollbars are slimmer and take on the colours of the theme you’re in, a community’s own included, and stay easy to see in high contrast mode.',
    ],
  },
  {
    id: '2026-10-04-developer-api',
    date: '2026-10-04',
    title: 'A bigger API, and new developer docs',
    items: [
      'The API has grown from 9 endpoints to 29: profiles, the community directory, members and roles, editing, deleting and reacting to messages, pins, forum threads and replies, wiki pages, answering events, the server browser and player history.',
      'The developer docs have been rebuilt, with examples in curl, JavaScript and Python for every endpoint and an OpenAPI file for Postman and code generators.',
      'API tokens that can post can now also make changes: reply, react, edit or delete your messages and answer events.',
    ],
  },
  {
    id: '2026-10-03-busy-times',
    date: '2026-10-03',
    title: 'Faster when it’s busy',
    items: [
      'Game Central now stays quick with many more people online at once: chat pages open and messages send far faster at busy times.',
      'Links are fetched ahead when you point at them, rather than every link on the page at once.',
    ],
  },
  {
    id: '2026-10-03-sounds-and-screens',
    date: '2026-10-03',
    title: 'New sounds, and shared screens full screen',
    items: [
      'Every sound pack has been redesigned: richer tones, a soft room echo, and the same volume across packs. Try them in Settings → Sounds.',
      'A shared screen in a voice channel can fill your screen: use the button on it, or double-click it.',
      'In the Windows app, What’s new now shows inside the app’s window.',
    ],
  },
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
