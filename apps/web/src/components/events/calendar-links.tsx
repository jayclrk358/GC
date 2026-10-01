'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarPlus, Copy, Download, Rss } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** "Add to calendar" for one event: a .ics download or Google Calendar. */
export function AddToCalendar({ icsHref, googleHref }: { icsHref: string; googleHref: string }) {
  const t = useTranslations('events');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus aria-hidden /> {t('addToCalendar')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <a href={icsHref} download>
            <Download aria-hidden /> {t('downloadIcs')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={googleHref} target="_blank" rel="noopener noreferrer">
            <CalendarPlus aria-hidden /> {t('googleCalendar')}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Subscribe to all of a community's events in a calendar app. */
export function SubscribeFeed({ feedUrl }: { feedUrl: string }) {
  const t = useTranslations('events');
  const webcal = feedUrl.replace(/^https?:/, 'webcal:');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Rss aria-hidden /> {t('subscribe')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-xs">
        <p className="px-2 py-1.5 text-sm text-muted">{t('subscribeHint')}</p>
        <DropdownMenuItem asChild>
          <a href={webcal}>
            <CalendarPlus aria-hidden /> {t('openInCalendar')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard
              .writeText(feedUrl)
              .then(() => toast.success(t('copied')))
              .catch(() => toast.error(t('copyFailed')));
          }}
        >
          <Copy aria-hidden /> {t('copyFeed')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
