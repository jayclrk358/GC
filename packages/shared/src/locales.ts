// The languages Magnox's interface is translated into. English is complete; any string missing
// from another language shows in English.

export const LOCALES = ['en', 'es', 'fr', 'de', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language's name in that language, for the picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  'pt-BR': 'Português (Brasil)',
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * The best language for an Accept-Language header ("pt-PT,pt;q=0.9,en;q=0.8"): an exact match,
 * else the same base language (any Portuguese gets pt-BR), in the browser's order of preference.
 */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const wanted = acceptLanguage
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((w) => w.tag && w.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of wanted) {
    const exact = LOCALES.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split('-')[0];
    const sameBase = LOCALES.find((l) => l.toLowerCase().split('-')[0] === base);
    if (sameBase) return sameBase;
  }
  return DEFAULT_LOCALE;
}
