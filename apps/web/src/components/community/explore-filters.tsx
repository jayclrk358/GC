'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { LANGUAGES, REGIONS } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FilterDisclosure } from '@/components/ui/filter-disclosure';

export function ExploreFilters({
  games,
  values,
}: {
  games: { id: string; name: string }[];
  values: Record<string, string | undefined>;
}) {
  const t = useTranslations('explore');
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
          (values.language ? 1 : 0) +
          (values.sort ? 1 : 0)
        }
      >
        <Field label={t('game')}>
          {(p) => (
            <Select {...p} name="game" defaultValue={values.game ?? ''}>
              <option value="">{t('any')}</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
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
        <Field label={t('language')}>
          {(p) => (
            <Select {...p} name="language" defaultValue={values.language ?? ''}>
              <option value="">{t('any')}</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {tc(`languages.${l}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('sort')}>
          {(p) => (
            <Select {...p} name="sort" defaultValue={values.sort ?? ''}>
              <option value="">{t('sortDefault')}</option>
              <option value="popular">{t('sortPopular')}</option>
              <option value="new">{t('sortNew')}</option>
            </Select>
          )}
        </Field>
      </FilterDisclosure>
      <Button type="submit" className="w-full">
        {t('apply')}
      </Button>
    </form>
  );
}
