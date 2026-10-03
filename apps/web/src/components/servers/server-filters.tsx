'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { REGIONS, SERVER_SORTS } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FilterDisclosure } from '@/components/ui/filter-disclosure';

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
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-20"
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
      <FilterDisclosure
        active={
          (values.game ? 1 : 0) +
          (values.region ? 1 : 0) +
          (values.minPlayers ? 1 : 0) +
          (values.online ? 1 : 0)
        }
      >
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
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="online"
            value="1"
            defaultChecked={values.online === '1' || values.online === 'true'}
            className="size-4 accent-[var(--c-primary)]"
          />
          {t('onlineOnly')}
        </label>
      </FilterDisclosure>
      <Button type="submit" className="w-full">
        {t('apply')}
      </Button>
    </form>
  );
}
