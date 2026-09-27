'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FlairBadge } from '@/components/forum/flair-badge';
import { createFlairAction, deleteFlairAction } from '@/app/actions/forum';

export interface FlairData {
  id: string;
  name: string;
  color: string | null;
  channelId: string | null;
  modOnly: boolean;
}

export function FlairManager({
  communityId,
  flairs,
  channels,
}: {
  communityId: string;
  flairs: FlairData[];
  channels: { id: string; name: string }[];
}) {
  const t = useTranslations('channels');
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState('#2563eb');
  const [channelId, setChannelId] = React.useState('');
  const [modOnly, setModOnly] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);
  const channelName = new Map(channels.map((c) => [c.id, c.name]));

  return (
    <section
      aria-labelledby="flairs-h"
      className="flex flex-col gap-4 rounded-ui-lg border border-border bg-surface p-5"
    >
      <div>
        <h2 id="flairs-h" className="text-lg font-bold">
          {t('flairsTitle')}
        </h2>
        <p className="text-sm text-muted">{t('flairsDescription')}</p>
      </div>
      {flairs.length === 0 ? (
        <p className="text-sm text-muted">{t('noFlairs')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {flairs.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
              <FlairBadge name={f.name} color={f.color} />
              <span className="flex-1 text-sm text-muted">
                {f.channelId ? `#${channelName.get(f.channelId) ?? '?'}` : t('allChannels')}
                {f.modOnly && ` · ${t('modOnly')}`}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('deleteFlair', { name: f.name })}
                onClick={async () => {
                  const r = await deleteFlairAction(communityId, f.id);
                  if (r.ok) router.refresh();
                  else toast.error(r.error);
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const r = await createFlairAction(communityId, {
            name,
            color,
            channelId: channelId || null,
            modOnly,
          });
          setPending(false);
          if (!r.ok) {
            setError(r.fields?.name ?? r.error);
            return;
          }
          setError(undefined);
          setName('');
          toast.success(t('flairCreated'));
          router.refresh();
        }}
      >
        <Field label={t('flairName')} error={error}>
          {(p) => (
            <Input {...p} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field label={t('flairColor')}>
          {(p) => (
            <Input
              {...p}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-16 p-1"
            />
          )}
        </Field>
        <Field label={t('flairChannel')}>
          {(p) => (
            <Select {...p} value={channelId} onValueChange={(v) => setChannelId(v)}>
              <option value="">{t('allChannels')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" loading={pending}>
          <Plus aria-hidden /> {t('addFlair')}
        </Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <input
            type="checkbox"
            className="size-4 accent-[var(--c-primary)]"
            checked={modOnly}
            onChange={(e) => setModOnly(e.target.checked)}
          />
          {t('modOnlyLabel')}
        </label>
      </form>
    </section>
  );
}
