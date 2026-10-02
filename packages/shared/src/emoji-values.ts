// Kept free of zod so the emoji code chat and editors need in the browser stays small. The
// schemas in emoji.ts validate input.

/** A custom emoji as the browser sees it. */
export interface CustomEmoji {
  id: string;
  name: string;
  url: string;
}

/** Reactions with a custom emoji are stored as "c:<emoji id>". */
const CUSTOM_PREFIX = 'c:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function customReaction(id: string): string {
  return `${CUSTOM_PREFIX}${id}`;
}

/** The emoji id in a custom reaction, or null for a Unicode one. */
export function customReactionId(reaction: string): string | null {
  if (!reaction.startsWith(CUSTOM_PREFIX)) return null;
  const id = reaction.slice(CUSTOM_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

/** Where a custom emoji's image is served (it redirects to the file, wherever that lives). */
export function emojiImagePath(id: string): string {
  return `/emoji/${id}`;
}

/** Common Unicode emoji by the names people type after ":" (Discord and Slack style). */
export const STANDARD_EMOJI: readonly (readonly [name: string, char: string])[] = [
  ['thumbsup', '👍'],
  ['thumbsdown', '👎'],
  ['heart', '❤️'],
  ['joy', '😂'],
  ['rofl', '🤣'],
  ['smile', '😄'],
  ['grin', '😁'],
  ['wink', '😉'],
  ['blush', '😊'],
  ['heart_eyes', '😍'],
  ['sunglasses', '😎'],
  ['thinking', '🤔'],
  ['neutral_face', '😐'],
  ['unamused', '😒'],
  ['eyes', '👀'],
  ['open_mouth', '😮'],
  ['cry', '😢'],
  ['sob', '😭'],
  ['angry', '😠'],
  ['rage', '😡'],
  ['skull', '💀'],
  ['scream', '😱'],
  ['sweat_smile', '😅'],
  ['upside_down', '🙃'],
  ['partying_face', '🥳'],
  ['tada', '🎉'],
  ['fire', '🔥'],
  ['100', '💯'],
  ['sparkles', '✨'],
  ['star', '⭐'],
  ['clap', '👏'],
  ['pray', '🙏'],
  ['wave', '👋'],
  ['ok_hand', '👌'],
  ['muscle', '💪'],
  ['raised_hands', '🙌'],
  ['handshake', '🤝'],
  ['point_up', '☝️'],
  ['check', '✅'],
  ['x', '❌'],
  ['warning', '⚠️'],
  ['question', '❓'],
  ['exclamation', '❗'],
  ['zzz', '💤'],
  ['rocket', '🚀'],
  ['trophy', '🏆'],
  ['crown', '👑'],
  ['gem', '💎'],
  ['moneybag', '💰'],
  ['video_game', '🎮'],
  ['joystick', '🕹️'],
  ['crossed_swords', '⚔️'],
  ['shield', '🛡️'],
  ['bow_and_arrow', '🏹'],
  ['pick', '⛏️'],
  ['bomb', '💣'],
  ['boom', '💥'],
  ['dart', '🎯'],
  ['dice', '🎲'],
  ['map', '🗺️'],
  ['pizza', '🍕'],
  ['coffee', '☕'],
  ['beer', '🍺'],
  ['popcorn', '🍿'],
  ['cake', '🎂'],
  ['gift', '🎁'],
  ['bell', '🔔'],
  ['mega', '📣'],
  ['pushpin', '📌'],
  ['link', '🔗'],
  ['lock', '🔒'],
  ['key', '🔑'],
  ['bulb', '💡'],
  ['wrench', '🔧'],
  ['hammer', '🔨'],
  ['gear', '⚙️'],
  ['clock', '🕒'],
  ['calendar', '📅'],
  ['heart_broken', '💔'],
  ['purple_heart', '💜'],
  ['blue_heart', '💙'],
  ['green_heart', '💚'],
  ['yellow_heart', '💛'],
  ['ghost', '👻'],
  ['alien', '👽'],
  ['robot', '🤖'],
  ['clown', '🤡'],
  ['poop', '💩'],
  ['cat', '🐱'],
  ['dog', '🐶'],
  ['dragon', '🐉'],
  ['earth', '🌍'],
  ['sun', '☀️'],
  ['moon', '🌙'],
  ['snowflake', '❄️'],
  ['zap', '⚡'],
  ['rainbow', '🌈'],
];

/** Suggestions for what's typed after ":", best first: names that start with it, then contain it. */
export function matchEmoji<T extends { name: string }>(
  items: readonly T[],
  query: string,
  max = 8,
): T[] {
  const q = query.toLowerCase();
  if (!q) return items.slice(0, max);
  const starts = items.filter((e) => e.name.startsWith(q));
  const inside = items.filter((e) => !e.name.startsWith(q) && e.name.includes(q));
  return [...starts, ...inside].slice(0, max);
}
