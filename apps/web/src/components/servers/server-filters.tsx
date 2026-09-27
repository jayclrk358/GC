'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { REGIONS, SERVER_SORTS } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';

export function ServerFilters({
  games,
  values,
}: {
  games: { id: string; name: string; count: number }[];
  values: Record<string, string | undefined>;
}) {
  const t = useTranslations('servers');
  const tc = useTranslations('community');
  const router = useRouter();
  const pathname = usePathname();
  return (
    <form
      role="search"
      aria-label={t('filters')}
      className="grid gap-3 rounded-ui-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_0.8fr_1fr_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const params = new URLSearchParams();
        for (const [k, v] of form.entries()) if (String(v).trim()) params.set(k, String(v).trim());
        // A tag picked from a card stays applied until it's removed.
        if (values.tag) params.set('tag', values.tag);
        router.push(`${pathname}?${params}`);
      }}
    >
      <Field label={t('search')}>
        {(p) => (
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              {...p}
              name="q"
              type="search"
              defaultValue={values.q ?? ''}
              placeholder={t('searchPlaceholder')}
              className="ps-9"
            />
          </div>
        )}
      </Field>
      <Field label={t('game')}>
        {(p) => (
          <Select {...p} name="game" defaultValue={values.game ?? ''}>
            <option value="">{t('any')}</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {t('gameOption', { name: g.name, count: g.count })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('region')}>
        {(p) => (
          <Select {...p} name="region" defaultValue={values.region ?? ''}>
            <option value="">{t('any')}</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {tc(`regions.${r}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('minPlayers')}>
        {(p) => (
          <Input
            {...p}
            name="minPlayers"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            defaultValue={values.minPlayers ?? ''}
          />
        )}
      </Field>
      <Field label={t('sort')}>
        {(p) => (
          <Select {...p} name="sort" defaultValue={values.sort ?? 'players'}>
            {SERVER_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sorts.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit">{t('apply')}</Button>
      <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-6">
        <input
          type="checkbox"
          name="online"
          value="1"
          defaultChecked={values.online === '1' || values.online === 'true'}
          className="size-4 accent-[var(--c-primary)]"
        />
        {t('onlineOnly')}
      </label>
    </form>
  );
}
