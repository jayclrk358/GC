// Intl formatters are slow to make (each one loads its locale's data) and quick to use, and the
// same few are wanted over and over: a chat page formats three times per message, every list
// formats each row. So each kind is made once and kept. There are only a handful of kinds (locale
// × options), so the caches stay small.

const dates = new Map<string, Intl.DateTimeFormat>();
const numbers = new Map<string, Intl.NumberFormat>();
const relatives = new Map<string, Intl.RelativeTimeFormat>();

function cached<F, O>(cache: Map<string, F>, make: (locale: string, options: O) => F) {
  return (locale: string, options: O): F => {
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = cache.get(key);
    if (!formatter) {
      formatter = make(locale, options);
      cache.set(key, formatter);
    }
    return formatter;
  };
}

export const dateFormat = cached(
  dates,
  (locale, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options),
);
export const numberFormat = cached(
  numbers,
  (locale, options: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options),
);
export const relativeFormat = cached(
  relatives,
  (locale, options: Intl.RelativeTimeFormatOptions) => new Intl.RelativeTimeFormat(locale, options),
);
