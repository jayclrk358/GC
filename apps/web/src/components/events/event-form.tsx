'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { Recurrence } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { createEventAction, updateEventAction } from '@/app/actions/events';

/** The form's fields; dates and times are on the event's own clock. */
export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  timezone: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  repeat: 'none' | Recurrence['freq'];
  interval: number;
  weekdays: number[];
  ends: 'never' | 'on' | 'after';
  until: string;
  count: number;
  capacity: number;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Every IANA zone, grouped by region ("Europe", "America"...). */
function zoneGroups(current: string): [string, string[]][] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['UTC'];
  }
  if (!zones.includes(current)) zones = [current, ...zones];
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  const groups = new Map<string, string[]>();
  for (const z of zones) {
    const region = z.includes('/') ? z.split('/')[0]! : 'Other';
    groups.set(region, [...(groups.get(region) ?? []), z]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function EventForm({
  communityId,
  eventId,
  initial,
}: {
  communityId: string;
  /** Editing this event (otherwise a new one). */
  eventId?: string;
  initial: EventFormValues;
}) {
  const t = useTranslations('events.form');
  const locale = useLocale();
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof EventFormValues>(k: K, val: EventFormValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const groups = React.useMemo(() => zoneGroups(v.timezone), [v.timezone]);
  // Monday to Sunday in the page's language (5 Jan 2026 was a Monday).
  const weekdays = React.useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      value: d,
      label: f.format(new Date(Date.UTC(2026, 0, 4 + (d === 0 ? 7 : d)))),
    }));
  }, [locale]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const input = {
      title: v.title,
      description: v.description,
      location: v.location,
      timezone: v.timezone,
      allDay: v.allDay,
      start: `${v.startDate}T${v.allDay ? '00:00' : v.startTime}`,
      // An all-day event runs to midnight after its last day.
      end: v.allDay ? `${nextDay(v.endDate)}T00:00` : `${v.endDate}T${v.endTime}`,
      capacity: v.capacity,
      recurrence:
        v.repeat === 'none'
          ? null
          : {
              freq: v.repeat,
              interval: v.interval,
              weekdays: v.repeat === 'weekly' ? v.weekdays : [],
              until: v.ends === 'on' ? v.until : null,
              count: v.ends === 'after' ? v.count : null,
            },
    };
    const r = eventId
      ? await updateEventAction(communityId, eventId, input)
      : await createEventAction(communityId, input);
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    toast.success(eventId ? t('saved') : t('created'));
    router.push(`/c/${r.data.slug}/events/${r.data.id}`);
    router.refresh();
  }

  const unit =
    v.repeat === 'daily' ? 'days' : v.repeat === 'weekly' ? 'weeks' : ('months' as const);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <FormError message={error} />
      <SettingsSection id="what" title={t('what')}>
        <div className="flex flex-col gap-4">
          <Field label={t('name')} error={fields.title} required>
            {(p) => (
              <Input
                {...p}
                value={v.title}
                maxLength={120}
                onChange={(e) => set('title', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('description')} error={fields.description}>
            {(p) => (
              <Textarea
                {...p}
                value={v.description}
                maxLength={4000}
                rows={5}
                onChange={(e) => set('description', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('location')} description={t('locationHint')} error={fields.location}>
            {(p) => (
              <Input
                {...p}
                value={v.location}
                maxLength={200}
                onChange={(e) => set('location', e.target.value)}
              />
            )}
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection id="when" title={t('when')}>
        <div className="flex flex-col gap-4">
          <SwitchField
            label={t('allDay')}
            checked={v.allDay}
            onCheckedChange={(c) => set('allDay', c)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('startDate')} error={fields.start} required>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={v.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value;
                    // Keep the end on or after the start.
                    setV((s) => ({
                      ...s,
                      startDate,
                      endDate: s.endDate < startDate ? startDate : s.endDate,
                    }));
                  }}
                />
              )}
            </Field>
            {!v.allDay && (
              <Field label={t('startTime')} required>
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    value={v.startTime}
                    onChange={(e) => set('startTime', e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field label={t('endDate')} error={fields.end} required>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={v.endDate}
                  min={v.startDate}
                  onChange={(e) => set('endDate', e.target.value)}
                />
              )}
            </Field>
            {!v.allDay && (
              <Field label={t('endTime')} required>
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    value={v.endTime}
                    onChange={(e) => set('endTime', e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
          <Field label={t('timezone')} description={t('timezoneHint')} error={fields.timezone}>
            {(p) => (
              <Select {...p} value={v.timezone} onValueChange={(z) => set('timezone', z)}>
                {groups.map(([region, zones]) => (
                  <optgroup key={region} label={region}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection id="repeat" title={t('repeat')}>
        <div className="flex flex-col gap-4">
          <Field label={t('repeat')} hideLabel>
            {(p) => (
              <Select
                {...p}
                value={v.repeat}
                onValueChange={(r) => set('repeat', r as EventFormValues['repeat'])}
              >
                <option value="none">{t('repeatNone')}</option>
                <option value="daily">{t('daily')}</option>
                <option value="weekly">{t('weekly')}</option>
                <option value="monthly">{t('monthly')}</option>
              </Select>
            )}
          </Field>
          {v.repeat !== 'none' && (
            <>
              <Field label={t('every')}>
                {(p) => (
                  <div className="flex items-center gap-2">
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      max={30}
                      className="w-24"
                      value={v.interval}
                      aria-describedby="repeat-unit"
                      onChange={(e) => set('interval', Math.max(1, Number(e.target.value) || 1))}
                    />
                    <span id="repeat-unit">{t(`unit.${unit}`, { count: v.interval })}</span>
                  </div>
                )}
              </Field>
              {v.repeat === 'weekly' && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold">{t('onDays')}</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {weekdays.map((d) => (
                      <label key={d.value} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--c-primary)]"
                          checked={v.weekdays.includes(d.value)}
                          onChange={(e) =>
                            set(
                              'weekdays',
                              e.target.checked
                                ? [...v.weekdays, d.value]
                                : v.weekdays.filter((x) => x !== d.value),
                            )
                          }
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-muted">{t('onDaysHint')}</p>
                </fieldset>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">{t('ends')}</legend>
                {(['never', 'on', 'after'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="ends"
                      className="size-4 accent-[var(--c-primary)]"
                      checked={v.ends === k}
                      onChange={() => set('ends', k)}
                    />
                    {t(`endsOptions.${k}`)}
                  </label>
                ))}
              </fieldset>
              {v.ends === 'on' && (
                <Field label={t('untilDate')} error={fields['recurrence.until']}>
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      className="sm:w-56"
                      min={v.startDate}
                      value={v.until}
                      onChange={(e) => set('until', e.target.value)}
                    />
                  )}
                </Field>
              )}
              {v.ends === 'after' && (
                <Field label={t('count')} error={fields['recurrence.count']}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      max={500}
                      className="w-28"
                      value={v.count}
                      onChange={(e) => set('count', Math.max(1, Number(e.target.value) || 1))}
                    />
                  )}
                </Field>
              )}
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="places" title={t('places')}>
        <Field label={t('capacity')} description={t('capacityHint')} error={fields.capacity}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={100000}
              className="w-32"
              value={v.capacity}
              onChange={(e) => set('capacity', Math.max(0, Number(e.target.value) || 0))}
            />
          )}
        </Field>
      </SettingsSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t('cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {eventId ? t('save') : t('create')}
        </Button>
      </div>
    </form>
  );
}
