import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import {
  decodePrefsCookie,
  DEFAULT_LOCALE,
  isLocale,
  matchLocale,
  PREFS_COOKIE,
  type Locale,
} from '@magnox/shared';
import en from '../../messages/en.json';

type Messages = Record<string, unknown>;

/** Another language over English, so anything not translated yet shows in English. */
function withFallback(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    out[k] =
      v && typeof v === 'object' && b && typeof b === 'object'
        ? withFallback(b as Messages, v as Messages)
        : v;
  }
  return out;
}

const loaded = new Map<Locale, Promise<Messages>>();
function messagesFor(locale: Locale): Promise<Messages> {
  if (locale === DEFAULT_LOCALE) return Promise.resolve(en);
  let p = loaded.get(locale);
  if (!p) {
    p = import(`../../messages/${locale}.json`).then(
      (m: { default: Messages }) => withFallback(en, m.default),
      () => en,
    );
    loaded.set(locale, p);
  }
  return p;
}

// The language: the person's choice (Settings → Accessibility & display), else their browser's.
export default getRequestConfig(async () => {
  const prefs = decodePrefsCookie((await cookies()).get(PREFS_COOKIE)?.value);
  const locale: Locale = isLocale(prefs.language)
    ? prefs.language
    : matchLocale((await headers()).get('accept-language'));
  return { locale, timeZone: 'UTC', messages: await messagesFor(locale) };
});
