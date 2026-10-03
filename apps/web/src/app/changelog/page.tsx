import { getFormatter, getTranslations } from 'next-intl/server';
import { CHANGELOG } from '@gamecentral/shared';

export const metadata = {
  title: 'What’s new',
  description: 'The latest updates to Game Central.',
};

export default async function ChangelogPage() {
  const [t, format] = await Promise.all([getTranslations('changelog'), getFormatter()]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 leading-relaxed">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted">{t('subtitle')}</p>
      </header>
      <ol className="flex flex-col gap-6">
        {CHANGELOG.map((entry, i) => (
          <li key={entry.id}>
            <article
              aria-labelledby={`${entry.id}-h`}
              className="rounded-ui-lg border border-border bg-surface p-5 sm:p-6"
            >
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <time dateTime={entry.date}>
                  {format.dateTime(new Date(`${entry.date}T12:00:00Z`), {
                    dateStyle: 'long',
                    timeZone: 'UTC',
                  })}
                </time>
                {i === 0 && (
                  <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">
                    {t('latest')}
                  </span>
                )}
              </p>
              <h2 id={`${entry.id}-h`} className="mt-1 text-xl font-bold">
                {entry.title}
              </h2>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 ps-5">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
