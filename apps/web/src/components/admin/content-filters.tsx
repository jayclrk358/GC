'use client';

import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';

/** A plain GET form: the filters stay in the address. */
export function ContentFilters({
  values,
}: {
  values: { q?: string; kind?: string; author?: string; community?: string };
}) {
  const t = useTranslations('admin.content');
  return (
    <form
      role="search"
      className="grid gap-3 rounded-ui-lg border border-border bg-surface p-4 sm:grid-cols-2"
    >
      <Field label={t('q')}>
        {(p) => <Input {...p} type="search" name="q" defaultValue={values.q ?? ''} />}
      </Field>
      <Field label={t('kind')}>
        {(p) => (
          <Select {...p} name="kind" defaultValue={values.kind ?? 'all'}>
            <option value="all">{t('kinds.all')}</option>
            <option value="message">{t('kinds.message')}</option>
            <option value="post">{t('kinds.post')}</option>
          </Select>
        )}
      </Field>
      <Field label={t('author')}>
        {(p) => (
          <Input {...p} name="author" placeholder="@username" defaultValue={values.author ?? ''} />
        )}
      </Field>
      <Field label={t('community')}>
        {(p) => (
          <Input
            {...p}
            name="community"
            placeholder="community-address"
            defaultValue={values.community ?? ''}
          />
        )}
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary">
          <Search aria-hidden /> {t('find')}
        </Button>
      </div>
    </form>
  );
}
