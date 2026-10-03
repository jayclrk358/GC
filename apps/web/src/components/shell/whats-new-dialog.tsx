'use client';

import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
// The data alone, so the dialog's code stays small.
import { CHANGELOG } from '@gamecentral/shared/changelog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/** The latest few updates, with a way to see them all. */
export function WhatsNewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('changelog');
  const tc = useTranslations('common');
  const format = useFormatter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title')} description={t('subtitle')} size="lg">
        <ol className="flex flex-col gap-3">
          {CHANGELOG.slice(0, 4).map((entry, i) => (
            <li key={entry.id}>
              <article
                aria-labelledby={`whats-new-${entry.id}`}
                className="rounded-ui border border-border bg-surface-2/50 p-4"
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
                <h3 id={`whats-new-${entry.id}`} className="mt-0.5 font-bold">
                  {entry.title}
                </h3>
                <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-sm">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="link">
            <Link href="/changelog" onClick={() => onOpenChange(false)}>
              {t('seeAll')}
            </Link>
          </Button>
          <DialogClose asChild>
            <Button>{tc('close')}</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
