import { useFormatter, useTranslations } from 'next-intl';

/**
 * Counts per day as bars, with the same numbers as a table for anyone who'd rather read them
 * (and for screen readers, which get a one-line summary of the chart itself).
 */
export function DailyBars({
  id,
  title,
  days,
  values,
}: {
  id: string;
  title: string;
  days: string[];
  values: number[];
}) {
  const t = useTranslations('analytics');
  const format = useFormatter();
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const peak = values.indexOf(Math.max(...values));
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const w = 100 / Math.max(1, values.length);
  return (
    <figure
      aria-labelledby={`${id}-h`}
      className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-4"
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="font-bold">
          {title}
        </h2>
        <span className="text-sm text-muted">{t('total', { count: total })}</span>
      </figcaption>
      <svg
        role="img"
        aria-label={
          total
            ? t('chartSummary', { total, peak: values[peak] ?? 0, day: day(days[peak] ?? '') })
            : t('chartEmpty')
        }
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-28 w-full"
      >
        {values.map((v, i) => {
          const h = v ? Math.max(1.2, (v / max) * 38) : 0.4;
          return (
            <rect
              key={days[i]}
              x={i * w + w * 0.15}
              y={40 - h}
              width={w * 0.7}
              height={h}
              rx={0.4}
              fill={v ? 'var(--c-primary)' : 'var(--c-border)'}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-muted" aria-hidden>
        <span>{day(days[0] ?? '')}</span>
        <span>{t('max', { count: max })}</span>
        <span>{day(days.at(-1) ?? '')}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-primary">{t('asTable')}</summary>
        {/* Scrolls, so it takes focus: keyboard users can scroll it too. */}
        <div
          className="mt-2 max-h-64 overflow-y-auto rounded-ui-sm"
          tabIndex={0}
          role="region"
          aria-label={t('tableOf', { title })}
        >
          <table className="w-full">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-1 text-start font-semibold">
                  {t('day')}
                </th>
                <th scope="col" className="py-1 text-end font-semibold">
                  {t('count')}
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-1 text-start font-normal">
                    {day(d)}
                  </th>
                  <td className="py-1 text-end tabular-nums">{values[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
