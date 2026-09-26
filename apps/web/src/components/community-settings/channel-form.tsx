'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';

export interface ChannelData {
  id: string;
  parentId: string | null;
  type: 'category' | 'forum' | 'text' | 'announcement' | 'wiki';
  name: string;
  topic: string;
  position: number;
  settings: { voting?: boolean; qa?: boolean; requireFlair?: boolean; defaultSort?: string };
  slowmodeSeconds: number;
}

const SLOWMODES = [0, 10, 30, 60, 300, 900, 3600];
const SORTS = ['latest', 'new', 'top', 'hot', 'unanswered'] as const;

export type ChannelFormValues = {
  type: 'forum' | 'announcement';
  name: string;
  topic: string;
  parentId: string | null;
  settings: {
    voting: boolean;
    qa: boolean;
    requireFlair: boolean;
    defaultSort: (typeof SORTS)[number];
  };
  slowmodeSeconds: number;
};

/** Create or edit a forum/announcement channel. */
export function ChannelForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  isNew,
}: {
  initial?: ChannelData;
  categories: { id: string; name: string }[];
  onSubmit: (
    v: ChannelFormValues,
  ) => Promise<{ error?: string; fields?: Record<string, string> } | void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const t = useTranslations('channels');
  const [v, setV] = React.useState<ChannelFormValues>({
    type: initial?.type === 'announcement' ? 'announcement' : 'forum',
    name: initial?.name ?? '',
    topic: initial?.topic ?? '',
    parentId: initial?.parentId ?? categories[0]?.id ?? null,
    settings: {
      voting: Boolean(initial?.settings.voting),
      qa: Boolean(initial?.settings.qa),
      requireFlair: Boolean(initial?.settings.requireFlair),
      defaultSort: (SORTS as readonly string[]).includes(initial?.settings.defaultSort ?? '')
        ? (initial!.settings.defaultSort as (typeof SORTS)[number])
        : 'latest',
    },
    slowmodeSeconds: initial?.slowmodeSeconds ?? 0,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = (patch: Partial<ChannelFormValues>) => setV((x) => ({ ...x, ...patch }));
  const setS = (patch: Partial<ChannelFormValues['settings']>) =>
    setV((x) => ({ ...x, settings: { ...x.settings, ...patch } }));

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await onSubmit(v);
        setPending(false);
        if (r?.error) {
          setError(r.error);
          setFields(r.fields ?? {});
        }
      }}
    >
      <FormError message={error} />
      {isNew && (
        <Field label={t('type')}>
          {(p) => (
            <Select
              {...p}
              value={v.type}
              onChange={(e) => set({ type: e.target.value as ChannelFormValues['type'] })}
            >
              <option value="forum">{t('types.forum')}</option>
              <option value="announcement">{t('types.announcement')}</option>
            </Select>
          )}
        </Field>
      )}
      <Field label={t('name')} description={t('nameHint')} error={fields.name} required>
        {(p) => (
          <Input
            {...p}
            value={v.name}
            maxLength={32}
            onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
            autoComplete="off"
          />
        )}
      </Field>
      <Field label={t('topic')} description={t('topicHint')} error={fields.topic}>
        {(p) => (
          <Input
            {...p}
            value={v.topic}
            maxLength={300}
            onChange={(e) => set({ topic: e.target.value })}
          />
        )}
      </Field>
      <Field label={t('category')}>
        {(p) => (
          <Select
            {...p}
            value={v.parentId ?? ''}
            onChange={(e) => set({ parentId: e.target.value || null })}
          >
            <option value="">{t('noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="flex flex-col rounded-ui border border-border px-4 py-2">
        <legend className="px-1 text-sm font-semibold">{t('forumOptions')}</legend>
        <SwitchField
          label={t('voting')}
          description={t('votingHint')}
          checked={v.settings.voting}
          onCheckedChange={(x) => setS({ voting: x })}
        />
        <SwitchField
          label={t('qa')}
          description={t('qaHint')}
          checked={v.settings.qa}
          onCheckedChange={(x) => setS({ qa: x })}
        />
        <SwitchField
          label={t('requireFlair')}
          description={t('requireFlairHint')}
          checked={v.settings.requireFlair}
          onCheckedChange={(x) => setS({ requireFlair: x })}
        />
        <Field label={t('defaultSort')} className="py-2">
          {(p) => (
            <Select
              {...p}
              value={v.settings.defaultSort}
              onChange={(e) =>
                setS({
                  defaultSort: e.target.value as ChannelFormValues['settings']['defaultSort'],
                })
              }
            >
              {SORTS.filter((s) => s !== 'unanswered' || v.settings.qa).map((s) => (
                <option key={s} value={s}>
                  {t(`sorts.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </fieldset>
      <Field label={t('slowmode')} description={t('slowmodeHint')}>
        {(p) => (
          <Select
            {...p}
            value={v.slowmodeSeconds}
            onChange={(e) => set({ slowmodeSeconds: Number(e.target.value) })}
          >
            {SLOWMODES.map((s) => (
              <option key={s} value={s}>
                {s === 0
                  ? t('slowmodeOff')
                  : s < 60
                    ? t('seconds', { count: s })
                    : s < 3600
                      ? t('minutes', { count: s / 60 })
                      : t('hours', { count: s / 3600 })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {isNew ? t('create') : t('save')}
        </Button>
      </div>
    </form>
  );
}
