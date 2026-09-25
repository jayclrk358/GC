'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import {
  Accessibility,
  Compass,
  Contrast,
  Home,
  Keyboard,
  Moon,
  Plus,
  Search,
  Server,
  Sun,
  Users,
} from 'lucide-react';
import { usePrefs } from './prefs-provider';

interface CommunityHit {
  slug: string;
  name: string;
  tagline: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  onShowShortcuts,
  signedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowShortcuts: () => void;
  signedIn: boolean;
}) {
  const t = useTranslations('palette');
  const ts = useTranslations('shell');
  const router = useRouter();
  const { prefs, save } = usePrefs();
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<CommunityHit[]>([]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { communities: [] }))
        .then((d: { communities?: CommunityHit[] }) => setHits(d.communities ?? []))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query]);

  const visibleHits = query.trim().length >= 2 ? hits : [];

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const dark =
    prefs.colorScheme === 'dark' ||
    (prefs.colorScheme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const item =
    'flex cursor-pointer items-center gap-3 rounded-ui-sm px-3 py-2.5 text-sm aria-selected:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted';
  const group =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted';

  return (
    <D.Root open={open} onOpenChange={handleOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-ui-lg border border-border bg-surface text-fg shadow-2xl"
        >
          <D.Title className="sr-only">{t('label')}</D.Title>
          <Command label={t('label')} shouldFilter={true} loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t('placeholder')}
                className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
                {t('empty')}
              </Command.Empty>

              {visibleHits.length > 0 && (
                <Command.Group heading={t('communities')} className={group}>
                  {visibleHits.map((c) => (
                    <Command.Item
                      key={c.slug}
                      value={`community ${c.name} ${c.slug}`}
                      onSelect={() => go(`/c/${c.slug}`)}
                      className={item}
                    >
                      <Users aria-hidden />
                      <span className="flex flex-col">
                        <span className="font-semibold">{c.name}</span>
                        {c.tagline && <span className="text-xs text-muted">{c.tagline}</span>}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading={t('navigate')} className={group}>
                <Command.Item onSelect={() => go('/')} className={item}>
                  <Home aria-hidden /> {ts('home')}
                </Command.Item>
                <Command.Item onSelect={() => go('/explore')} className={item}>
                  <Compass aria-hidden /> {ts('explore')}
                </Command.Item>
                <Command.Item onSelect={() => go('/servers')} className={item}>
                  <Server aria-hidden /> {ts('servers')}
                </Command.Item>
                <Command.Item onSelect={() => go('/settings/accessibility')} className={item}>
                  <Accessibility aria-hidden /> {ts('accessibility')}
                </Command.Item>
                {signedIn && (
                  <Command.Item onSelect={() => go('/new')} className={item}>
                    <Plus aria-hidden /> {ts('createCommunity')}
                  </Command.Item>
                )}
              </Command.Group>

              <Command.Group heading={t('actions')} className={group}>
                <Command.Item
                  onSelect={() => {
                    void save({ ...prefs, colorScheme: dark ? 'light' : 'dark' });
                    handleOpenChange(false);
                  }}
                  className={item}
                >
                  {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
                  {t('toggleScheme', { scheme: dark ? 'light' : 'dark' })}
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    void save({
                      ...prefs,
                      contrast: prefs.contrast === 'high' ? 'normal' : 'high',
                    });
                    handleOpenChange(false);
                  }}
                  className={item}
                >
                  <Contrast aria-hidden />
                  {t('toggleContrast', { state: prefs.contrast === 'high' ? 'off' : 'on' })}
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    handleOpenChange(false);
                    onShowShortcuts();
                  }}
                  className={item}
                >
                  <Keyboard aria-hidden /> {t('shortcuts')}
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
